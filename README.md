# AI-Analysis-Tool

Home-brewed chat with your data. Or BAT-brewed, rather.  
Capable of working with .csv files with our custom python runtime environment,
without compromises. Additionally, with the ability to work on Kinaxis data via
.xml files.

## Setup

0. Ensure you have Python version >=3.10 installed.

1. Create your own venv (to avoid conflicts with your system packages)  
   `python -m venv venv`  
   and enter it:  
   `.\venv\Scripts\activate.ps1` if you're using Powershell
   `.\venv\Scripts\activate.bat` if you're using cmd.exe

2. Install necessary requirements  
   `pip install -r requirements.txt`

3. Prepare the frontend:  
   Enter the frontend/ directory (`cd frontend`), and run in a separate
   window:  
    `npm run watch`

    - For production use simply run once:  
       `npm run build`

4. Run `python app.py` to launch the backend in debug mode.

### Notes for production use

Building the frontend once: `cd frontend && npm run build`

Running app.py directly **will run the app in debug mode**. You should use
something like **gunicorn** for running the backend in a production
environment.  
e.g.  
`python3 -m gunicorn app:app`

## Usage

This project is a webapp. Once you setup everything the app is accessible via a
browser, by default available at [http://127.0.0.1:5000](http://127.0.0.1:5000)
(check your commandline output for details).

## Rationale

There are many available tools that allow you to chat "with your data". However
none of the tools meet our own requirements, have very limited python runtime
environments with a poor subset of available packages for advanced data
analysis, or are simply comically expensive. Additionally we'd like to be able
to import and work with our own (quite esoteric) data sources, like
Kinaxis-generated XML files.
