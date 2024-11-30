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

UPLOAD_FOLDER = "uploads"

load_dotenv()
app = Flask(__name__, template_folder="frontend/dist")
app.secret_key = os.getenv("APP_SECRET_KEY")
# Configure upload folder and allowed extensions
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["SESSION_TYPE"] = "filesystem"
app.config["MAX_CONTENT_LENGTH"] = 16 * 1000 * 1000
Session(app)

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

ALLOWED_EXTENSIONS = {".csv", ".xml"}


def get_extension(filename: str):
    name, extension = os.path.splitext(filename)
    return extension


def allowed_file(filename: str):
    return "." in filename and get_extension(filename) in ALLOWED_EXTENSIONS


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
    file_ext = get_extension(file.filename)
    if file_ext == ".csv":
        session["dataframe"] = pd.read_csv(file.stream)
        # print(session["dataframe"])
    elif file_ext == ".xml":
        session["dataframe"] = xml_str_to_df(file.stream.read())
        # print(session["dataframe"])
    agent_context = MemorySaver()
    agent_context.storage.default_factory = defaultdictoverride
    session["agent_context"] = agent_context

    return jsonify({"message": "File uploaded successfully"}), 200


@app.route("/clear", methods=["POST"])
def clear_chatlog():
    if session.get("agent_context"):
        agent_context = MemorySaver()
        agent_context.storage.default_factory = defaultdictoverride
        session["agent_context"] = agent_context
        return "cleared", 200
    else:
        return "no agent session, nothing to clear", 200


def defaultdictoverride():
    return defaultdict(dict)

@app.route("/ask", methods=["POST"])
def ask_question():
    data = request.get_json()
    question = data.get("question")
    print("======", question, "======", sep="\n")
    # Retrieve DataFrame from the session
    df = session.get("dataframe")
    if df is None:
        return jsonify({"error": "No CSV file uploaded"}), 400
    if question == "":
        return jsonify({"answer": "Please provide a question"})
    agent_context = session.get("agent_context")
    if agent_context is None:
        print("no memory, creating one")
        agent_context = MemorySaver()
        agent_context.storage.default_factory = defaultdictoverride
    else:
        print(agent_context)
        print(type(agent_context))
        print(agent_context.storage)
    agent = pandas_agent.PandasAgent(df, agent_context)
    answer = agent.invoke(question)
    print("saving")
    session["agent_context"] = agent_context
    print("save ok")
    # Process the question
    return jsonify({"answer": answer, "image": agent.extra_content})


@app.route("/forecast", methods=["POST"])
def forecast():
    data = request.get_json()
    date_column = data.get("date_column")
    value_column = data.get("value_column")
    periods = int(data.get("periods", 10))

    csv_filepath = session.get("csv_filepath")
    if not csv_filepath:
        return jsonify({"error": "No CSV file uploaded"}), 400

    csv_data = pd.read_csv(csv_filepath)
    agent = pandas_agent.PandasAgent(csv_data)
    forecast = agent.forecast_time_series(date_column, value_column, periods)

    if isinstance(forecast, str):
        return jsonify({"error": forecast}), 400

    return jsonify(forecast.to_dict(orient="records"))


if __name__ == "__main__":
    app.run(debug=True)
