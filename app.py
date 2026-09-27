from flask import Flask, request, jsonify, render_template, session, redirect, url_for
import requests
import base64
import pdfplumber
from sentence_transformers import SentenceTransformer
import faiss
import numpy as np
from flask_mysqldb import MySQL
from huggingface_hub import InferenceClient
from werkzeug.security import generate_password_hash, check_password_hash
from groq import Groq
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev_secret_key_change_in_production")

# ---------------- MYSQL CONFIG ----------------

app.config['MYSQL_HOST'] = os.environ.get('MYSQL_HOST', 'localhost')
app.config['MYSQL_USER'] = os.environ.get('MYSQL_USER', 'root')
app.config['MYSQL_PASSWORD'] = os.environ.get('MYSQL_PASSWORD', '')
app.config['MYSQL_DB'] = os.environ.get('MYSQL_DB', 'ai_app')

mysql = MySQL(app)

# ---------------- API KEYS ----------------

HF_API_KEY = os.environ.get("HF_API_KEY", "")

# ✅ GROQ KEY
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
client = Groq(api_key=GROQ_API_KEY)

# ---------------- EMBEDDING MODEL ----------------

embedding_model = SentenceTransformer("all-MiniLM-L6-v2")

# ---------------- PDF STORAGE ----------------

pdf_chunks = []
pdf_index = None

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

    cur = mysql.connection.cursor()
    cur.execute(
        "SELECT id, type, user_msg, ai_msg FROM chats WHERE user_id=%s ORDER BY id DESC",
        (session["user_id"],)
    )

    data = cur.fetchall()

    chats = []
    for row in data:
        chats.append({
            "id": row[0],
            "type": row[1],
            "user": row[2],
            "ai": row[3],
            "title": row[2][:30]
        })

    return jsonify(chats)

# ---------------- TEXT GENERATION (GROQ) ----------------

@app.route("/generate_text", methods=["POST"])
def generate_text():

    if not check_limit():
        return jsonify({"result": "LIMIT_REACHED"})

    data = request.json
    prompt = data.get("prompt")

    try:
        completion = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        result = completion.choices[0].message.content

        if "user_id" in session:
            cur = mysql.connection.cursor()
            cur.execute(
                "INSERT INTO chats (user_id,type,user_msg,ai_msg) VALUES (%s,%s,%s,%s)",
                (session["user_id"], "text", prompt, result)
            )
            mysql.connection.commit()

        return jsonify({"result": result})

    except Exception as e:
        print("TEXT ERROR:", e)
        return jsonify({"result": "Error generating text"})

# ---------------- IMAGE GENERATION ----------------

@app.route("/generate_image", methods=["POST"])
def generate_image():

    if not check_limit():
        return jsonify({"result": "LIMIT_REACHED"})

    data = request.json
    prompt = data.get("prompt")

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
        image.save(image_bytes, format="PNG")

        img_base64 = base64.b64encode(
            image_bytes.getvalue()
        ).decode("utf-8")

        if "user_id" in session:
            cur = mysql.connection.cursor()

            cur.execute(
                "INSERT INTO chats (user_id,type,user_msg,ai_msg) VALUES (%s,%s,%s,%s)",
                (session["user_id"], "image", prompt, img_base64)
            )

            mysql.connection.commit()

        return jsonify({"result": img_base64})

    except Exception as e:
        print("IMAGE ERROR:", e)
        return jsonify({"result": "Image generation failed"})# ---------------- PDF UPLOAD ----------------

@app.route("/upload_pdf", methods=["POST"])
def upload_pdf():

    global pdf_chunks, pdf_index

    file = request.files["file"]

    if not file.filename.endswith(".pdf"):
        return jsonify({"status": "Invalid file"})

    text = ""

    with pdfplumber.open(file) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text

    chunk_size = 500
    pdf_chunks = [text[i:i+chunk_size] for i in range(0, len(text), chunk_size)]

    embeddings = embedding_model.encode(pdf_chunks)

    dimension = embeddings.shape[1]
    pdf_index = faiss.IndexFlatL2(dimension)
    pdf_index.add(np.array(embeddings))

    return jsonify({"status": "PDF uploaded"})

# ---------------- PDF QUESTION (GROQ) ----------------

@app.route("/ask_pdf", methods=["POST"])
def ask_pdf():

    if not check_limit():
        return jsonify({"result": "LIMIT_REACHED"})

    global pdf_chunks, pdf_index

    if pdf_index is None:
        return jsonify({"result": "Please upload a PDF first."})

    data = request.json
    question = data.get("question")

    question_embedding = embedding_model.encode([question])
    D, I = pdf_index.search(np.array(question_embedding), 3)

    context = "\n".join([pdf_chunks[i] for i in I[0]])

    prompt = f"""
Answer using the following PDF context.

Context:
{context}

Question:
{question}
"""

    try:
        completion = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        result = completion.choices[0].message.content

        if "user_id" in session:
            cur = mysql.connection.cursor()
            cur.execute(
                "INSERT INTO chats (user_id,type,user_msg,ai_msg) VALUES (%s,%s,%s,%s)",
                (session["user_id"], "pdf", question, result)
            )
            mysql.connection.commit()

        return jsonify({"result": result})

    except Exception as e:
        print("PDF ERROR:", e)
        return jsonify({"result": "Error reading PDF"})

# ---------------- DELETE CHAT ----------------

@app.route("/delete_chat/<int:chat_id>", methods=["DELETE"])
def delete_chat(chat_id):

    if "user_id" not in session:
        return "Unauthorized"

    cur = mysql.connection.cursor()
    cur.execute(
        "DELETE FROM chats WHERE id=%s AND user_id=%s",
        (chat_id, session["user_id"])
    )
    mysql.connection.commit()

    return "Deleted"

# ---------------- RENAME CHAT ----------------

@app.route("/rename_chat/<int:chat_id>", methods=["POST"])
def rename_chat(chat_id):

    if "user_id" not in session:
        return "Unauthorized"

    data = request.json
    new_title = data.get("title")

    cur = mysql.connection.cursor()
    cur.execute(
        "UPDATE chats SET user_msg=%s WHERE id=%s AND user_id=%s",
        (new_title, chat_id, session["user_id"])
    )
    mysql.connection.commit()

    return "Renamed"

# ---------------- RUN ----------------

if __name__ == "__main__":
    app.run(debug=True)