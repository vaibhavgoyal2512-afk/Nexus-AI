# AI Multimodal Studio

AI Multimodal Studio is a feature-rich, Flask-based web application that unifies AI Text Generation, AI Image Generation, and an AI-powered PDF Retrieval-Augmented Generation (RAG) Assistant into a cohesive modern dashboard. Featuring full user authentication, chat/image history persistence, and seamless dark/light theme switching, it offers an all-in-one platform for interacting with cutting-edge AI models.

---

## 1. Project Overview

AI Multimodal Studio serves as a multi-functional hub where users can:
- Generate human-like text responses using state-of-the-art LLMs via the Groq API.
- Synthesize realistic images from textual prompts using Hugging Face Inference (`FLUX.1-schnell`).
- Upload PDF documents and query their contents interactively using semantic search (`sentence-transformers` + `FAISS`) paired with LLM context comprehension.
- Authenticate (Register/Login) to save, view, and manage past chat sessions, generated images, and document queries stored in MySQL.

---

## 2. Features

- **AI Text Generator**: High-speed conversational AI response generation powered by Groq.
- **AI Image Generator**: Text-to-image synthesis using Hugging Face's `FLUX.1-schnell` model.
- **AI PDF Assistant**: Instant PDF parsing, chunking, vector embedding, and similarity search for context-aware Q&A.
- **User Authentication**: Secure user registration, password hashing (`Werkzeug`), and session management.
- **History & Persistence**: Individualized history storage for text chats, generated images, and PDF Q&A records.
- **Interactive Management**: Ability to rename or delete chat sessions.
- **Dark / Light Theme**: Dynamic theme switching with state persistence via `localStorage`.
- **Modern Responsive UI**: Clean dashboard layout built with responsive design standards.

---

## 3. Tech Stack

- **Backend**: Python 3.x, Flask, Werkzeug
- **AI & ML Integration**: Groq API (`groq`), Hugging Face Inference API (`huggingface_hub`), SentenceTransformers (`all-MiniLM-L6-v2`), FAISS Vector Index (`faiss-cpu`), `pdfplumber`
- **Database**: MySQL, `Flask-MySQLdb`
- **Frontend**: HTML5, Vanilla CSS3, JavaScript (ES6+)
- **Environment & Utilities**: `python-dotenv`

---

## 4. Project Structure

```text
Nexus_AI/
├── app.py                  # Main Flask application backend and route handlers
├── database_schema.sql     # MySQL database initialization script
├── requirements.txt        # Python package dependencies
├── .env.example            # Environment variables template file
├── .gitignore              # Files and folders ignored by Git
├── README.md               # Project documentation
├── static/
│   ├── main.css            # Base styles and dashboard layout
│   ├── text.css            # Text generator specific styles
│   ├── image.css           # Image generator specific styles
│   ├── pdf.css             # PDF assistant specific styles
│   ├── login.css           # Auth page styling
│   ├── text.js             # Logic for text generation UI & history
│   ├── image.js            # Logic for image generation UI & history
│   └── pdf.js              # Logic for PDF upload, Q&A, and vector search UI
└── templates/
    ├── main.html           # Main dashboard home template
    ├── text.html           # Text generation page template
    ├── image.html          # Image generation page template
    ├── pdf.html            # PDF assistant page template
    ├── login.html          # Login page template
    └── register.html       # User registration page template
```

---

## 5. Installation

### Prerequisites
- Python 3.9+
- MySQL Server (Local or Remote)
- Git

### Setup Steps
1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/AI-Multimodal-Studio.git
   cd AI-Multimodal-Studio
   ```

2. **Create and activate a virtual environment**:
   ```bash
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

---

## 6. Environment Variables

Create a `.env` file in the root directory by copying `.env.example`:

```bash
cp .env.example .env
```

Configure your environment variables in `.env`:

```env
FLASK_SECRET_KEY=your_secret_key_here
MYSQL_HOST=localhost
MYSQL_USER=your_mysql_user
MYSQL_PASSWORD=your_mysql_password
MYSQL_DB=ai_app
HF_API_KEY=your_huggingface_token_here
GROQ_API_KEY=your_groq_api_key_here
```

---

## 7. MySQL Database Setup

1. Log into your MySQL console:
   ```bash
   mysql -u root -p
   ```

2. Run the provided schema file `database_schema.sql`:
   ```sql
   SOURCE database_schema.sql;
   ```
   Or manually execute:
   ```sql
   CREATE DATABASE IF NOT EXISTS ai_app;
   USE ai_app;

   CREATE TABLE IF NOT EXISTS users (
       id INT AUTO_INCREMENT PRIMARY KEY,
       name VARCHAR(255) NOT NULL,
       email VARCHAR(255) NOT NULL UNIQUE,
       password VARCHAR(255) NOT NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );

   CREATE TABLE IF NOT EXISTS chats (
       id INT AUTO_INCREMENT PRIMARY KEY,
       user_id INT NOT NULL,
       type VARCHAR(50) NOT NULL,
       user_msg TEXT NOT NULL,
       ai_msg LONGTEXT NOT NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
   );
   ```

---

## 8. How to Run

1. Ensure your MySQL service is running.
2. Verify that your `.env` contains valid credentials.
3. Start the Flask server:
   ```bash
   python app.py
   ```
4. Access the web dashboard at `http://127.0.0.1:5000`.

---

## 9. AI Text Generation

- Powered by Groq API (`openai/gpt-oss-20b`).
- Submits prompts asynchronously and receives fast streaming-ready completions.
- Saves chat turns into the `chats` table (`type='text'`) for authenticated users.

---

## 10. AI Image Generation

- Leverages Hugging Face Inference API using the `black-forest-labs/FLUX.1-schnell` model.
- Converts output image bytes directly to Base64 data for instantaneous browser rendering.
- Stores Base64 image records in `chats` (`type='image'`) for historical review.

---

## 11. AI PDF Assistant

- Parses PDF contents page-by-page using `pdfplumber`.
- Chunks text content into 500-character blocks.
- Generates vector embeddings using `sentence-transformers/all-MiniLM-L6-v2`.
- Constructs an in-memory L2 distance index via `faiss`.
- Performs semantic retrieval on question input and constructs context-augmented prompts for Groq LLM synthesis.

---

## 12. Authentication

- **Registration**: Enforces strong password rules (minimum 8 chars, 1 uppercase, 1 digit, 1 special character).
- **Security**: Passwords hashed securely using `generate_password_hash`.
- **Session Management**: Tracks user sessions via Flask secure session cookies.

---

## 13. Screenshots Placeholder Section

*(Add screenshots of your UI features here)*
- `[Screenshot: Main Dashboard]`
- `[Screenshot: Text Generator]`
- `[Screenshot: Image Generator]`
- `[Screenshot: PDF Assistant]`

---

## 14. Security Notes

- Secrets and credentials must never be committed to source control.
- Ensure `.env` remains in `.gitignore`.
- Rotate API tokens immediately if ever exposed.

---

## 15. Future Improvements

- Add support for additional document types (DOCX, TXT, CSV).
- Integrate conversation streaming (Server-Sent Events / WebSockets).
- Implement persistent FAISS vector indices per user document upload.
- Add multi-factor authentication (MFA).

---

## 16. License

This project is licensed under the MIT License - see the LICENSE file for details.
