import os
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

class Config:
    SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "medchain-default-dev-secret-key-2026")
    DATABASE_PATH = os.path.join(BASE_DIR, "database", "healthcare.db")
    
    # Blockchain
    BLOCKCHAIN_RPC_URL = os.getenv("BLOCKCHAIN_RPC_URL", "http://127.0.0.1:8545")
    BLOCKCHAIN_CHAIN_ID = int(os.getenv("BLOCKCHAIN_CHAIN_ID", "1337"))
    BLOCKCHAIN_PRIVATE_KEY = os.getenv("BLOCKCHAIN_PRIVATE_KEY", "0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d")
    DEPLOYER_ADDRESS = os.getenv("DEPLOYER_ADDRESS", "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1")
    CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS", "")
    
    # Paths
    ABI_PATH = os.path.join(BASE_DIR, "blockchain", "contract_abi.json")
    DEPLOYMENT_INFO_PATH = os.path.join(BASE_DIR, "blockchain", "deployment_info.json")
    ML_MODEL_PATH = os.path.join(BASE_DIR, "ml", "model.joblib")
    ML_SCALER_PATH = os.path.join(BASE_DIR, "ml", "scaler.joblib")
