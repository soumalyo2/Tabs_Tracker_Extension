from flask import Flask
from flask_cors import CORS
from database import init_db
from routes import api_blueprint

def create_app():
    app = Flask(__name__)          # 1. Initialize the core Flask application
    CORS(app)
    init_db()
    app.register_blueprint(api_blueprint, url_prefix='/api')
    return app
    # 2. Enable Cross-Origin Resource Sharing (CORS)
    # Browsers strictly block web pages (and extensions) from talking to servers 
    # on different domains. This allows your Chrome Extension to send POST/GET requests 
    # to your local localhost server without getting blocked.

if __name__ == "__main__":
    app = create_app()
    app.run(debug=True, host="localhost", port=5000)