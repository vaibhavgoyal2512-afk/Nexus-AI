import os
import sys

# Critical for Windows: Prevent Intel OpenMP error #15 crash when FAISS & PyTorch/SentenceTransformers coexist
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
os.environ["TOKENIZERS_PARALLELISM"] = "false"

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
if hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

import io
import time
import base64
import threading
import requests
import numpy as np
import pdfplumber
import faiss
from flask import Flask, request, jsonify, render_template, session, redirect, url_for, send_file, Response
from flask_mysqldb import MySQL
from huggingface_hub import InferenceClient
from werkzeug.security import generate_password_hash, check_password_hash
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev_secret_key_change_in_production")

def check_has_conv_column(cur):
    try:
        cur.execute("SHOW COLUMNS FROM chats LIKE 'conversation_id'")
        res = cur.fetchone()
        return res is not None
    except Exception:
        return False

# ---------------- MYSQL CONFIG ----------------

app.config['MYSQL_HOST'] = os.environ.get('MYSQL_HOST', 'localhost')
app.config['MYSQL_USER'] = os.environ.get('MYSQL_USER', 'root')
app.config['MYSQL_PASSWORD'] = os.environ.get('MYSQL_PASSWORD', '')
app.config['MYSQL_DB'] = os.environ.get('MYSQL_DB', 'ai_app')
app.config['MYSQL_PORT'] = int(os.environ.get('MYSQL_PORT', 3306))
app.config['MYSQL_CHARSET'] = 'utf8mb4'

mysql = MySQL(app)

# ---------------- API KEYS ----------------

HF_API_KEY = os.environ.get("HF_API_KEY", "")

# ✅ GROQ KEY
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
client = Groq(api_key=GROQ_API_KEY)

# ---------------- EMBEDDING MODEL ----------------

embedding_model = None
embedding_lock = threading.Lock()

def get_embedding_model():
    global embedding_model
    if embedding_model is None:
        with embedding_lock:
            if embedding_model is None:
                from sentence_transformers import SentenceTransformer
                embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
    return embedding_model

def _warmup_model():
    try:
        get_embedding_model()
        print("DEBUG: Embedding model loaded & warmed up successfully.")
    except Exception as e:
        print("DEBUG: Embedding model warmup warning (will retry on demand):", e)

threading.Thread(target=_warmup_model, daemon=True).start()

# ---------------- PDF STORAGE ----------------

pdf_chunks = []
pdf_index = None
current_pdf_meta = {
    "filename": None,
    "size": 0,
    "chunk_count": 0,
    "data": None,
    "content_type": "application/pdf"
}

# ---------------- PROMPT LIMIT ----------------

PROMPT_LIMIT = 50

def check_limit():
    if "count" not in session:
        session["count"] = 0

    if session["count"] >= PROMPT_LIMIT and "user_id" not in session:
        return False

    session["count"] += 1
    return True

# ---------------- PASSWORD VALIDATION ----------------

def valid_password(pw):
    if len(pw) < 8:
        return False
    if not pw[0].isupper():
        return False
    if not any(char.isdigit() for char in pw):
        return False
    if not any(not char.isalnum() for char in pw):
        return False
    return True

# ---------------- LOGIN ----------------

@app.route("/login", methods=["GET","POST"])
def login():
    if request.method == "POST":
        email = request.form.get("email")
        password = request.form.get("password")

        cur = mysql.connection.cursor()
        cur.execute("SELECT * FROM users WHERE email=%s", (email,))
        user = cur.fetchone()

        if user and check_password_hash(user[3], password):
            session["user_id"] = user[0]
            session["name"] = user[1]
            session["email"] = user[2]
            return redirect(url_for("home"))
        else:
            return "Invalid credentials"

    return render_template("login.html")

# ---------------- REGISTER ----------------

@app.route("/register", methods=["GET", "POST"])
def register():

    if request.method == "POST":

        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "")

        # Basic validation
        if not name or not email or not password:
            return "All fields are required"

        # Password validation
        if not valid_password(password):
            return """
            Invalid password format.<br><br>
            Password must:<br>
            • Be at least 8 characters long<br>
            • Start with an uppercase letter<br>
            • Contain at least one number<br>
            • Contain at least one special character<br><br>
            <a href="/register">Go Back</a>
            """

        try:
            cur = mysql.connection.cursor()

            # Check existing user
            cur.execute(
                "SELECT * FROM users WHERE email=%s",
                (email,)
            )

            user = cur.fetchone()

            if user:
                cur.close()
                return """
                User already exists.<br><br>
                <a href="/login">Go to Login</a>
                """

            # Hash password
            hashed_password = generate_password_hash(password)

            # Insert user
            cur.execute(
                "INSERT INTO users (name, email, password) VALUES (%s, %s, %s)",
                (name, email, hashed_password)
            )

            mysql.connection.commit()
            cur.close()

            return redirect(url_for("login"))

        except Exception as e:
            print("REGISTER ERROR:", e)
            return "Registration failed. Check Flask terminal for error."

    return render_template("register.html")


# ---------------- LOGOUT ----------------

@app.route("/logout")
def logout():
    session.clear()
    return redirect("/")

# ---------------- HOME ----------------

@app.route("/")
def home():
    return render_template("main.html")

# ---------------- PAGE ROUTES ----------------

@app.route("/text")
def text():
    return render_template("text.html")

@app.route("/image")
def image():
    return render_template("image.html")

@app.route("/pdf")
def pdf():
    return render_template("pdf.html")

# ---------------- GET CHATS ----------------

@app.route("/get_chats")
def get_chats():

    if "user_id" not in session:
        return jsonify([])

    try:
        cur = mysql.connection.cursor()
        has_conv = check_has_conv_column(cur)

        if has_conv:
            cur.execute(
                """
                SELECT id, COALESCE(conversation_id, CAST(id AS CHAR)) as conv_id, type, user_msg, ai_msg, created_at 
                FROM chats 
                WHERE user_id=%s 
                ORDER BY id ASC
                """,
                (session["user_id"],)
            )
        else:
            cur.execute(
                "SELECT id, CAST(id AS CHAR) as conv_id, type, user_msg, ai_msg, created_at FROM chats WHERE user_id=%s ORDER BY id ASC",
                (session["user_id"],)
            )

        data = cur.fetchall()
        cur.close()

        conversations_dict = {}
        for row in data:
            row_id = row[0]
            conv_id = str(row[1])
            chat_type = row[2]
            user_msg = row[3]
            ai_msg = row[4]
            created_at = str(row[5])

            if conv_id not in conversations_dict:
                conversations_dict[conv_id] = {
                    "id": conv_id,
                    "conversation_id": conv_id,
                    "type": chat_type,
                    "title": user_msg[:35] if user_msg else "New Conversation",
                    "user": user_msg,
                    "ai": ai_msg,
                    "created_at": created_at,
                    "messages": []
                }

            conversations_dict[conv_id]["messages"].append({
                "id": row_id,
                "user": user_msg,
                "ai": ai_msg,
                "type": chat_type
            })

        result_list = list(conversations_dict.values())
        result_list.reverse()

        return jsonify(result_list)

    except Exception as e:
        print("GET_CHATS ERROR:", e)
        return jsonify([])

# ---------------- GET CONVERSATION MESSAGES ----------------

@app.route("/get_conversation/<conversation_id>")
def get_conversation(conversation_id):

    if "user_id" not in session:
        return jsonify([])

    try:
        cur = mysql.connection.cursor()
        try:
            cur.execute("SET NAMES utf8mb4;")
        except Exception:
            pass
        has_conv = check_has_conv_column(cur)

        if has_conv:
            cur.execute(
                """
                SELECT id, type, user_msg, ai_msg, created_at 
                FROM chats 
                WHERE user_id=%s AND (conversation_id=%s OR CAST(id AS CHAR)=%s)
                ORDER BY id ASC
                """,
                (session["user_id"], str(conversation_id), str(conversation_id))
            )
        else:
            cur.execute(
                "SELECT id, type, user_msg, ai_msg, created_at FROM chats WHERE user_id=%s AND CAST(id AS CHAR)=%s ORDER BY id ASC",
                (session["user_id"], str(conversation_id))
            )

        rows = cur.fetchall()
        cur.close()

        messages = []
        for r in rows:
            messages.append({
                "id": r[0],
                "type": r[1],
                "user": r[2],
                "ai": r[3],
                "created_at": str(r[4])
            })
        return jsonify(messages)
    except Exception as e:
        print("GET_CONVERSATION ERROR:", e)
        return jsonify([])

# ---------------- TEXT GENERATION (GROQ) ----------------

@app.route("/generate_text", methods=["POST"])
def generate_text():

    if not check_limit():
        return jsonify({"result": "LIMIT_REACHED"})

    data = request.json or {}
    prompt = data.get("prompt", "").strip()
    conv_id = data.get("conversation_id")

    if not prompt:
        return jsonify({"result": "Prompt is required"})

    if not conv_id or not str(conv_id).strip() or str(conv_id).strip().lower() in ["null", "undefined", "none"]:
        conv_id = f"conv_{int(time.time() * 1000)}"
    else:
        conv_id = str(conv_id).strip()

    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"result": "Please login first"}), 401

    print("DEBUG generate_text")
    print("USER:", user_id)
    print("PROMPT:", prompt)
    print("CONVERSATION_ID:", conv_id)

    try:
        messages = []

        cur = mysql.connection.cursor()
        try:
            cur.execute("SET NAMES utf8mb4;")
        except Exception:
            pass
        has_conv = check_has_conv_column(cur)
        if has_conv:
            cur.execute(
                "SELECT user_msg, ai_msg FROM chats WHERE conversation_id=%s AND user_id=%s AND type='text' ORDER BY id ASC",
                (conv_id, user_id)
            )
            history = cur.fetchall()
            for h_user, h_ai in history:
                messages.append({"role": "user", "content": h_user})
                messages.append({"role": "assistant", "content": h_ai})
        cur.close()

        messages.append({"role": "user", "content": prompt})

        completion = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=messages
        )

        result = completion.choices[0].message.content

        cur = mysql.connection.cursor()
        try:
            cur.execute("SET NAMES utf8mb4;")
        except Exception:
            pass
        has_conv = check_has_conv_column(cur)
        if has_conv:
            cur.execute(
                "INSERT INTO chats (user_id, type, user_msg, ai_msg, conversation_id) VALUES (%s, %s, %s, %s, %s)",
                (user_id, "text", prompt, result, conv_id)
            )
        else:
            cur.execute(
                "INSERT INTO chats (user_id, type, user_msg, ai_msg) VALUES (%s, %s, %s, %s)",
                (user_id, "text", prompt, result)
            )
        mysql.connection.commit()
        cur.close()
        print("DEBUG: CHAT INSERT COMMITTED FOR USER:", user_id)

        return jsonify({"result": result, "conversation_id": conv_id})

    except Exception as e:
        import traceback
        print("TEXT GENERATION ERROR:", e)
        traceback.print_exc()
        return jsonify({"result": f"Database / Generation Error: {str(e)}"}), 500

# ---------------- IMAGE GENERATION ----------------

@app.route("/generate_image", methods=["POST"])
def generate_image():

    if not check_limit():
        return jsonify({"result": "LIMIT_REACHED"})

    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"result": "Please login first"}), 401

    data = request.json or {}
    prompt = data.get("prompt", "").strip()
    conv_id = data.get("conversation_id")

    if not prompt:
        return jsonify({"result": "Prompt is required"})

    if not conv_id or not str(conv_id).strip() or str(conv_id).strip().lower() in ["null", "undefined", "none"]:
        conv_id = f"conv_{int(time.time() * 1000)}"
    else:
        conv_id = str(conv_id).strip()

    try:
        image_client = InferenceClient(
            provider="fal-ai",
            api_key=HF_API_KEY
        )

        image = image_client.text_to_image(
            prompt,
            model="black-forest-labs/FLUX.1-schnell"
        )

        import io
        image_bytes = io.BytesIO()
        image.convert("RGB").save(image_bytes, format="JPEG", quality=85)

        img_base64 = "data:image/jpeg;base64," + base64.b64encode(
            image_bytes.getvalue()
        ).decode("utf-8")

        cur = mysql.connection.cursor()
        try:
            cur.execute("SET NAMES utf8mb4;")
        except Exception:
            pass
        has_conv = check_has_conv_column(cur)
        if has_conv:
            cur.execute(
                "INSERT INTO chats (user_id,type,user_msg,ai_msg,conversation_id) VALUES (%s,%s,%s,%s,%s)",
                (user_id, "image", prompt, img_base64, conv_id)
            )
        else:
            cur.execute(
                "INSERT INTO chats (user_id,type,user_msg,ai_msg) VALUES (%s,%s,%s,%s)",
                (user_id, "image", prompt, img_base64)
            )
        mysql.connection.commit()
        cur.close()
        print("DEBUG: IMAGE CHAT INSERT COMMITTED FOR USER:", user_id)

        return jsonify({"result": img_base64, "conversation_id": conv_id})

    except Exception as e:
        import traceback
        print("IMAGE ERROR:", e)
        traceback.print_exc()
        return jsonify({"result": f"Image generation failed: {str(e)}"}), 500

# ---------------- PDF UPLOAD ----------------

@app.route("/upload_pdf", methods=["POST"])
def upload_pdf():

    global pdf_chunks, pdf_index

    if "file" not in request.files:
        return jsonify({"status": "error", "message": "No file attached in request"}), 400

    file = request.files["file"]

    if not file or not file.filename:
        return jsonify({"status": "error", "message": "No file selected"}), 400

    if not file.filename.lower().endswith(".pdf"):
        return jsonify({"status": "error", "message": "Invalid file format. Please select a .pdf document."}), 400

    try:
        file_bytes = file.read()
        if not file_bytes:
            return jsonify({"status": "error", "message": "The uploaded PDF file is empty (0 bytes)."}), 400

        text = ""

        # Strategy 1: pdfplumber standard page extraction + word extraction fallback (for slides)
        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                for page in pdf.pages:
                    try:
                        page_text = page.extract_text()
                        if page_text and page_text.strip():
                            text += page_text + "\n"
                        else:
                            # For slides: text is often inside text-boxes/word shapes
                            words = page.extract_words()
                            if words:
                                word_text = " ".join([w.get("text", "") for w in words if w.get("text")])
                                if word_text.strip():
                                    text += word_text + "\n"
                    except Exception as pe:
                        print("pdfplumber page extract error:", pe)
        except Exception as e:
            print("pdfplumber open error:", e)

        # Strategy 2: pypdf / PyPDF2 (great fallback for presentations & varied PDF streams)
        if len(text.strip()) < 20:
            pypdf_module = None
            try:
                import pypdf
                pypdf_module = pypdf
            except ImportError:
                try:
                    import PyPDF2
                    pypdf_module = PyPDF2
                except ImportError:
                    pass

            if pypdf_module:
                try:
                    reader = pypdf_module.PdfReader(io.BytesIO(file_bytes))
                    pypdf_text = ""
                    for page in reader.pages:
                        try:
                            p_text = page.extract_text()
                            if p_text and p_text.strip():
                                pypdf_text += p_text + "\n"
                        except Exception as pe:
                            print("pypdf page extract error:", pe)
                    if len(pypdf_text.strip()) > len(text.strip()):
                        text = pypdf_text
                except Exception as e:
                    print("pypdf extraction error:", e)

        # Strategy 3: pdfminer.six high_level extract_text
        if len(text.strip()) < 20:
            try:
                from pdfminer.high_level import extract_text as miner_extract
                miner_text = miner_extract(io.BytesIO(file_bytes))
                if miner_text and len(miner_text.strip()) > len(text.strip()):
                    text = miner_text
            except Exception as e:
                print("pdfminer extract error:", e)

        clean_text = text.strip()

        if not clean_text:
            return jsonify({
                "status": "error",
                "message": "Could not extract readable text from this PDF. The document may be scanned, image-only, password-protected, or empty."
            }), 400

        # Chunk text with overlap
        chunk_size = 500
        chunk_overlap = 50
        step = max(1, chunk_size - chunk_overlap)
        chunks = []
        for i in range(0, len(clean_text), step):
            chunk = clean_text[i:i + chunk_size].strip()
            if chunk:
                chunks.append(chunk)

        if not chunks:
            chunks = [clean_text]

        pdf_chunks = chunks

        model = get_embedding_model()
        embeddings = model.encode(pdf_chunks, convert_to_numpy=True)

        embeddings_np = np.array(embeddings, dtype=np.float32)
        if embeddings_np.ndim == 1:
            embeddings_np = np.expand_dims(embeddings_np, axis=0)

        if embeddings_np.shape[0] == 0:
            return jsonify({
                "status": "error",
                "message": "Failed to generate embeddings for the document text."
            }), 500

        dimension = embeddings_np.shape[1]

        pdf_index = faiss.IndexFlatL2(dimension)
        pdf_index.add(embeddings_np)

        # Detect page count
        total_pages = 1
        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                total_pages = len(pdf.pages)
        except Exception:
            pass

        # Detect presentation title
        detected_title = file.filename.rsplit('.', 1)[0]
        first_lines = [line.strip() for line in clean_text.split('\n') if line.strip()]
        if first_lines:
            for cand in first_lines[:5]:
                clean_cand = cand.strip('#* \t')
                if 4 < len(clean_cand) < 80 and not clean_cand.lower().startswith(('page', 'slide', 'table', 'index')):
                    detected_title = clean_cand
                    break

        print(f"DEBUG: Successfully indexed PDF '{file.filename}' with {len(pdf_chunks)} chunks, {total_pages} pages.")

        current_pdf_meta = {
            "filename": file.filename,
            "title": detected_title,
            "page_count": total_pages,
            "size": len(file_bytes),
            "chunk_count": len(pdf_chunks),
            "data": file_bytes,
            "content_type": "application/pdf"
        }

        return jsonify({
            "status": "PDF uploaded",
            "filename": file.filename,
            "title": detected_title,
            "page_count": total_pages,
            "chunk_count": len(pdf_chunks),
            "size": len(file_bytes),
            "view_url": "/view_pdf",
            "download_url": "/download_pdf"
        })

    except Exception as e:
        import traceback
        print("PDF UPLOAD ERROR:", e)
        traceback.print_exc()
        return jsonify({
            "status": "error",
            "message": f"Server error processing PDF: {str(e)}"
        }), 500

# ---------------- PDF QUESTION (GROQ) ----------------

@app.route("/ask_pdf", methods=["POST"])
def ask_pdf():

    if not check_limit():
        return jsonify({"result": "LIMIT_REACHED"})

    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"result": "Please login first"}), 401

    global pdf_chunks, pdf_index

    if pdf_index is None or not pdf_chunks:
        return jsonify({"result": "Please upload a PDF document first."})

    data = request.json or {}
    question = data.get("question", "").strip()
    conv_id = data.get("conversation_id")

    if not question:
        return jsonify({"result": "Question is required"})

    if not conv_id or not str(conv_id).strip() or str(conv_id).strip().lower() in ["null", "undefined", "none"]:
        conv_id = f"conv_{int(time.time() * 1000)}"
    else:
        conv_id = str(conv_id).strip()

    try:
        model = get_embedding_model()
        question_embedding = model.encode([question], convert_to_numpy=True)
        q_emb_np = np.array(question_embedding, dtype=np.float32)
        if q_emb_np.ndim == 1:
            q_emb_np = np.expand_dims(q_emb_np, axis=0)

        k = min(3, len(pdf_chunks))
        D, I = pdf_index.search(q_emb_np, k)

        valid_indices = [i for i in I[0] if 0 <= i < len(pdf_chunks)]
        if not valid_indices:
            context = "No relevant context found in document."
        else:
            context = "\n\n".join([pdf_chunks[i] for i in valid_indices])

        prompt = f"""
Answer using the following PDF context.

Context:
{context}

Question:
{question}
"""

        completion = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        result = completion.choices[0].message.content

        cur = mysql.connection.cursor()
        try:
            cur.execute("SET NAMES utf8mb4;")
        except Exception:
            pass
        has_conv = check_has_conv_column(cur)
        if has_conv:
            cur.execute(
                "INSERT INTO chats (user_id,type,user_msg,ai_msg,conversation_id) VALUES (%s,%s,%s,%s,%s)",
                (user_id, "pdf", question, result, conv_id)
            )
        else:
            cur.execute(
                "INSERT INTO chats (user_id,type,user_msg,ai_msg) VALUES (%s,%s,%s,%s)",
                (user_id, "pdf", question, result)
            )
        mysql.connection.commit()
        cur.close()
        print("DEBUG: PDF CHAT INSERT COMMITTED FOR USER:", user_id)

        return jsonify({"result": result, "conversation_id": conv_id})

    except Exception as e:
        import traceback
        print("PDF ERROR:", e)
        traceback.print_exc()
        return jsonify({"result": f"Error reading PDF: {str(e)}"}), 500

# ---------------- PDF PREVIEW & DOWNLOAD ----------------

@app.route("/view_pdf")
def view_pdf():
    global current_pdf_meta
    if not current_pdf_meta.get("data"):
        return "<h3 style='font-family:sans-serif; text-align:center; margin-top:50px;'>No PDF document is currently loaded. Please upload a PDF first.</h3>", 404
    return send_file(
        io.BytesIO(current_pdf_meta["data"]),
        mimetype="application/pdf",
        as_attachment=False,
        download_name=current_pdf_meta["filename"] or "document.pdf"
    )

@app.route("/download_pdf")
def download_pdf():
    global current_pdf_meta
    if not current_pdf_meta.get("data"):
        return "No PDF document currently loaded.", 404
    return send_file(
        io.BytesIO(current_pdf_meta["data"]),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=current_pdf_meta["filename"] or "document.pdf"
    )

@app.route("/get_current_pdf")
def get_current_pdf():
    global current_pdf_meta, pdf_chunks
    if not current_pdf_meta.get("filename") or not current_pdf_meta.get("data"):
        return jsonify({"has_pdf": False})
    return jsonify({
        "has_pdf": True,
        "filename": current_pdf_meta["filename"],
        "title": current_pdf_meta.get("title") or current_pdf_meta["filename"].rsplit('.', 1)[0],
        "page_count": current_pdf_meta.get("page_count", 1),
        "size": current_pdf_meta["size"],
        "chunk_count": len(pdf_chunks),
        "chunks": pdf_chunks[:60],
        "view_url": "/view_pdf",
        "download_url": "/download_pdf"
    })

# ---------------- DELETE CHAT ----------------

@app.route("/delete_chat/<chat_id>", methods=["DELETE"])
def delete_chat(chat_id):

    if "user_id" not in session:
        return jsonify({"status": "Unauthorized"}), 401

    try:
        cur = mysql.connection.cursor()
        has_conv = check_has_conv_column(cur)
        if has_conv:
            cur.execute(
                "DELETE FROM chats WHERE (conversation_id=%s OR CAST(id AS CHAR)=%s) AND user_id=%s",
                (str(chat_id), str(chat_id), session["user_id"])
            )
        else:
            cur.execute(
                "DELETE FROM chats WHERE CAST(id AS CHAR)=%s AND user_id=%s",
                (str(chat_id), session["user_id"])
            )
        mysql.connection.commit()
        cur.close()
        return jsonify({"status": "Deleted"})
    except Exception as e:
        print("DELETE ERROR:", e)
        return jsonify({"status": "Delete failed"}), 500

# ---------------- RENAME CHAT ----------------

@app.route("/rename_chat/<chat_id>", methods=["POST"])
def rename_chat(chat_id):

    if "user_id" not in session:
        return jsonify({"status": "Unauthorized"}), 401

    data = request.json or {}
    new_title = data.get("title", "").strip()
    if not new_title:
        return jsonify({"status": "Invalid title"}), 400

    try:
        cur = mysql.connection.cursor()
        has_conv = check_has_conv_column(cur)
        if has_conv:
            cur.execute(
                """
                UPDATE chats 
                SET user_msg = %s 
                WHERE (conversation_id = %s OR CAST(id AS CHAR) = %s) 
                  AND user_id = %s 
                  AND id = (
                    SELECT min_id FROM (
                      SELECT MIN(id) AS min_id 
                      FROM chats 
                      WHERE (conversation_id = %s OR CAST(id AS CHAR) = %s) AND user_id = %s
                    ) AS t
                  )
                """,
                (new_title, str(chat_id), str(chat_id), session["user_id"], str(chat_id), str(chat_id), session["user_id"])
            )
        else:
            cur.execute(
                "UPDATE chats SET user_msg=%s WHERE CAST(id AS CHAR)=%s AND user_id=%s",
                (new_title, str(chat_id), session["user_id"])
            )
        mysql.connection.commit()
        cur.close()

        return jsonify({"status": "Renamed"})
    except Exception as e:
        print("RENAME ERROR:", e)
        return jsonify({"status": "Rename failed"}), 500

# ---------------- RUN ----------------

if __name__ == "__main__":
    # use_reloader=False prevents watchdog on Windows from triggering infinite restart loops when transformers touches site-packages
    app.run(debug=True, use_reloader=False)