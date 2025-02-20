from collections import defaultdict
import os
import uuid
from flask import Flask, request, jsonify, render_template, session, send_from_directory
from flask_session import Session
import pandas as pd
from dotenv import load_dotenv
import pandas_agent
from utils.xml_parser import xml_str_to_df
from langgraph.checkpoint.memory import MemorySaver
from werkzeug.utils import secure_filename
import logging

# Configure logging
logging.basicConfig(level=logging.ERROR)

UPLOAD_FOLDER = "uploads"

load_dotenv()
app = Flask(__name__, template_folder="frontend/dist")
app.secret_key = os.getenv("APP_SECRET_KEY")
# Configure upload folder and allowed extensions
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["SESSION_TYPE"] = "filesystem"
# app.config["SESSION_FILE_DIR"] = "./flask_session"
app.config["MAX_CONTENT_LENGTH"] = 16 * 1000 * 1000
Session(app)

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

ALLOWED_EXTENSIONS = {".csv", ".xml"}


def get_extension(filename: str):
    _, extension = os.path.splitext(filename)
    return extension.lower()


def allowed_file(filename: str):
    return "." in filename and get_extension(filename) in ALLOWED_EXTENSIONS


def defaultdictoverride():
    return defaultdict(dict)


@app.route("/")
def index():
    return render_template("index.html")


# Endpoint for frontend to easily get images.
@app.route("/assets/<filename>")
def serve_image(filename):
    return send_from_directory("frontend/dist/assets", filename)


@app.route("/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": "Invalid file type"}), 400

    try:
        filename = secure_filename(file.filename)
        file_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
        file.save(file_path)  # Save file to disk
        session["csv_filepath"] = file_path  # Save file path in session

        file_ext = get_extension(file.filename)
        if file_ext == ".csv":
            session["dataframe"] = pd.read_csv(file_path)
        elif file_ext == ".xml":
            session["dataframe"] = xml_str_to_df(file.stream.read())

        agent_context = MemorySaver()
        agent_context.storage.default_factory = defaultdictoverride
        session["agent_context"] = agent_context

        return jsonify({"message": "File uploaded successfully"}), 200
    except Exception as e:
        logging.error("Error during file upload: %s", str(e))
        return jsonify({"error": "Failed to upload file"}), 500


@app.route("/clear", methods=["POST"])
def clear_chatlog():
    if session.get("agent_context"):
        agent_context = MemorySaver()
        agent_context.storage.default_factory = defaultdictoverride
        session["agent_context"] = agent_context
        return "cleared", 200
    else:
        return "no agent session, nothing to clear", 200


@app.route("/ask", methods=["POST"])
def ask_question():
    data = request.get_json()
    question = data.get("question", "").strip()

    # Retrieve DataFrame from the session
    csv_filepath = session.get("csv_filepath")
    if not csv_filepath:
        return jsonify({"error": "No file uploaded"}), 400

    try:
        df = pd.read_csv(csv_filepath)
    except Exception as e:
        logging.error("Error reading CSV file: %s", str(e))
        return jsonify({"error": "Failed to process the uploaded file"}), 500

    if not question:
        return jsonify({"answer": "Please provide a valid question."}), 400

    # Handle table-related questions
    if "table" in question.lower() or "rows" in question.lower():
        # Extract the number of rows requested
        import re

        match = re.search(r"(\d+)\s*rows", question.lower())
        num_rows = (
            int(match.group(1)) if match else 10
        )  # Default to 10 rows if no number is specified

        # Limit rows to the maximum available rows in the DataFrame
        num_rows = min(num_rows, len(df))

        # Prepare table data
        table_data = {
            "headers": df.columns.tolist(),
            "rows": df.head(num_rows).values.tolist(),
        }
        return jsonify(
            {
                "answer": f"Here are the first {num_rows} rows of the data:",
                "table": table_data,
            }
        )

    # General question handling (fallback to agent)
    try:
        agent_context = session.get("agent_context")
        if agent_context is None:
            agent_context = MemorySaver()
            agent_context.storage.default_factory = defaultdictoverride

        agent = pandas_agent.PandasAgent(df, agent_context)
        answer = agent.invoke(question)
        session["agent_context"] = agent_context  # Save updated context
        return jsonify({"answer": answer, "image": agent.extra_content, "table": None})
    except Exception as e:
        logging.error("Error in /ask endpoint: %s", str(e))
        return jsonify({"error": "Failed to process the question."}), 500


@app.route("/forecast", methods=["POST"])
def forecast():
    data = request.get_json()
    date_column = data.get("date_column")
    value_column = data.get("value_column")

    try:
        periods = int(data.get("periods", 10))
        if periods <= 0:
            raise ValueError("Periods must be a positive integer.")
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    csv_filepath = session.get("csv_filepath")
    if not csv_filepath:
        return jsonify({"error": "No CSV file uploaded"}), 400

    try:
        csv_data = pd.read_csv(csv_filepath)
        agent = pandas_agent.PandasAgent(csv_data)
        forecast = agent.forecast_time_series(date_column, value_column, periods)

        if isinstance(forecast, str):
            return jsonify({"error": forecast}), 400

        return jsonify(forecast.to_dict(orient="records"))
    except Exception as e:
        logging.error("Error in /forecast endpoint: %s", str(e))
        return jsonify({"error": "Failed to generate forecast"}), 500


if __name__ == "__main__":
    app.run(debug=True)
