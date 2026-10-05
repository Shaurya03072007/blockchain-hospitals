# MedChain Guard: Blockchain Healthcare Data Security System
### Major / Final-Year Academic Project Prototype (Windows LAN Environment)

---

## 1. Project Overview & Abstract

Modern healthcare applications face a dual challenge: protecting sensitive **Electronic Health Records (EHR)** against unauthorized insider probing and data exfiltration while guaranteeing **tamper-resistant auditability**. Storing medical records directly on a blockchain is prohibitively slow, expensive, and a critical violation of patient data privacy.

**MedChain Guard** demonstrates a hybrid architecture:
1. **Off-Chain Relational Storage (SQLite):** Fictional patient demographics, clinical diagnoses, prescriptions, and physician notes live strictly off-chain.
2. **On-Chain Cryptographic Integrity (Ethereum / Solidity):** A deterministic **SHA-256 hash** of the canonical EHR representation is anchored to an Ethereum smart contract (`HealthcareAccess.sol`). Any direct unauthorized modification to the database breaks the cryptographic hash comparison.
3. **Smart Contract-Enforced Access Audit Trail:** Every EHR read, edit, or denied unauthorized attempt is permanently logged into an immutable append-only blockchain ledger.
4. **Machine Learning Anomaly Detection (scikit-learn Isolation Forest):** An unsupervised threat detection engine inspects access velocity, time-of-day, reading duration, and repeated permission failures in real-time, assigning a dynamic risk score ($0.0 - 1.0$) and triggering automated alerts.
5. **Local Area Network (LAN) Accessible:** Built to run on a local Windows PC (`0.0.0.0:5000`) and be accessed seamlessly by other laptops or smartphones on the same Wi-Fi network without requiring cloud infrastructure.

> **Academic Honesty Notice:** This system is an academic engineering prototype designed for demonstration on a local LAN. It does not replace HIPAA/GDPR clinical systems and makes no claim of absolute security. The machine learning dataset is generated synthetically to model healthcare workflows.

---

## 2. Technology Stack & Justifications

| Layer | Component | Choice | Reason for Selection |
| :--- | :--- | :--- | :--- |
| **Backend** | Framework | **Python 3.11 + Flask** | Lightweight, transparent MVC architecture, native binding to `0.0.0.0` for LAN access. |
| **Database** | Storage | **SQLite3** | Zero-configuration single-file database (`healthcare.db`); ideal for academic presentations. |
| **Blockchain** | Local Node | **Ganache CLI** | Instant local mining, 10 pre-funded test accounts, zero gas expenses or testnet faucets. |
| | Smart Contract | **Solidity ^0.8.20** | Industry-standard EVM contract language with checked arithmetic. |
| | Web3 Client | **Web3.py (v6.x)** | Official Python Ethereum client library for signing and broadcasting transactions. |
| **Machine Learning** | Anomaly Detection | **scikit-learn Isolation Forest** | Unsupervised partition trees detect rare high-velocity or off-hour anomalies without labeled fraud data. |
| **Frontend** | User Interface | **HTML5 / CSS / React / Tailwind** | Responsive clinical dashboard with multi-role viewports, live hash verifiers, and audit charts. |

---

## 3. Storage Architecture: On-Chain vs. Off-Chain

```
                ┌──────────────────────────────────────┐
                │        Flask Backend (Port 5000)     │
                └──────────────────┬───────────────────┘
                                   │
             ┌─────────────────────┼─────────────────────┐
             ▼                     ▼                     ▼
      Authentication            EHR DB               ML Monitor
       (PBKDF2 Hash)           (SQLite)          (Isolation Forest)
             │                     │                     │
             ▼                     ▼                     ▼
       Role Check            Canonical SHA-256       Risk Score
       (Doctor/Admin)          Record Hash           (0.0 - 1.0)
             │                     │
             └──────────┬──────────┘
                        ▼
            Web3.py Contract Call
                        ▼
      ┌────────────────────────────────────┐
      │  Local Ethereum Blockchain Node    │
      │  - Event: AccessLogged             │
      │  - Function: verifyRecordHash()    │
      │  - Tx Hash & Block Number Receipts │
      └────────────────────────────────────┘
```

- **Off-Chain (SQLite):** Patient Names, DOB, Medical History, Allergies, Current Diagnoses, Prescriptions, Doctor Notes.
- **On-Chain (Blockchain):** `patientCode`, canonical `recordHash` (`0x...`), actor username, actor role, timestamp, `isAuthorized` flag, transaction receipts.

---

## 4. Hardware & Software Requirements (Windows 10/11)

1. **Python 3.11.x (64-bit)**: Download from [python.org](https://www.python.org/downloads/) *(Ensure "Add Python to PATH" is checked during setup)*.
2. **Node.js (v20.x LTS)**: Download from [nodejs.org](https://nodejs.org/) *(Includes `npm`)*.
3. **Ganache CLI**: Install globally via npm:
   ```cmd
   npm install -g ganache
   ```
4. **Git for Windows** (Optional): For terminal and cloning.

---

## 5. Exact Startup Procedure (Step-by-Step for Windows)

### Step 1: Open PowerShell or Command Prompt
Navigate to the project root directory:
```powershell
cd C:\Users\YourName\blockchain-healthcare-security
```

### Step 2: Create and Activate Virtual Environment
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
# (In CMD: venv\Scripts\activate.bat)
```

### Step 3: Install Python Dependencies
```powershell
pip install --upgrade pip
pip install -r requirements.txt
```

### Step 4: Terminal 1 — Start the Local Ethereum Blockchain
In a dedicated PowerShell window:
```powershell
ganache --port 8545 --networkId 1337 --deterministic
```
*Leave this terminal running. Ganache will output 10 test accounts with 100 ETH each.*

### Step 5: Terminal 2 — Deploy Contract, Initialize DB & Train ML
In your main virtualenv terminal:
```powershell
# 1. Deploy the HealthcareAccess.sol smart contract to local Ganache node
python blockchain/deploy.py

# 2. Seed SQLite database with demo accounts, EHR records, and SHA-256 hashes
python database/seed.py

# 3. Generate synthetic clinical access log dataset
python ml/generate_dataset.py

# 4. Train the scikit-learn Isolation Forest model and serialize artifacts
python ml/train_model.py
```

### Step 6: Start the Flask Application Server
```powershell
python app.py
```
*Output will indicate:*
```
* Running on all addresses (0.0.0.0)
* Running on http://127.0.0.1:5000
* Running on http://192.168.1.100:5000 (LAN)
```

---

## 6. LAN Access: Connecting from Other Devices

To allow a secondary laptop, tablet, or smartphone on your Wi-Fi network to access the prototype:

### 1. Find Your Windows PC Local IP
Run in Command Prompt:
```cmd
ipconfig
```
Look for `IPv4 Address` under your active Wi-Fi adapter (e.g., `192.168.1.100`).

### 2. Configure Windows Firewall (Run as Administrator in PowerShell)
If external LAN devices cannot connect, open TCP port 5000:
```powershell
New-NetFirewallRule -DisplayName "MedChain Flask LAN 5000" -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow
```

### 3. Open on Secondary Device
On your smartphone browser connected to the same Wi-Fi, open:
```
http://192.168.1.100:5000
```

---

## 7. Demonstration Accounts

| Role | Username | Password | Purpose & Assigned Permissions |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin` | `admin123` | Full system oversight, security alerts, smart contract inspector. |
| **Doctor 1** | `doctor1` | `doctor123` | **Dr. Robert Vance, MD**. Assigned to **P-1001** and **P-1002**. *(Unauthorized for P-1003)* |
| **Doctor 2** | `doctor2` | `doctor123` | **Dr. Sarah Chen, MD**. Assigned to **P-1002** and **P-1003**. |
| **Patient 1** | `patient1` | `patient123` | **Johnathan Doe**. Can only view their own record (**P-1001**) and access history. |
| **Security Officer** | `security1` | `sec123` | **Chief Auditor Michael Reed**. Investigates ML anomaly flags and threat bursts. |

---

## 8. Guided Evaluator Demonstration Workflows

### Demo 1: Normal Authorized Clinical Access
1. Sign in or switch role to `doctor1`.
2. Select patient **P-1001 (Johnathan Doe)**.
3. The clinical chart displays diagnoses, allergies, and prescriptions.
4. An on-chain `VIEW_RECORD` access event is submitted to Ganache with a live Transaction Hash (`0x...`) and block confirmation.
5. Audit log reflects `SUCCESS` with low ML risk score ($0.04$).

### Demo 2: Unauthorized RBAC Violation (HTTP 403)
1. Sign in as `doctor1`.
2. Select patient **P-1003 (Alice Wong)**, assigned exclusively to Dr. Chen.
3. Flask halts the request with an HTTP 403 Access Denied banner.
4. An on-chain `UNAUTHORIZED_ACCESS` violation is recorded to the blockchain.
5. The Admin/Security dashboard rings a **HIGH severity RBAC Violation Alert**.

### Demo 3: Machine Learning Anomaly Detection
1. Open the **ML Security Monitor** tab.
2. Click **"Inject Bulk Scraper"** (simulates 38 patient accesses in 10 minutes at 1.2s/record).
3. The **Isolation Forest** computes an outlier score ($-0.62$), classifying the behavior as **SUSPICIOUS (94% Threat Risk)**.
4. An incident alert is dispatched with feature explainability reasons.

### Demo 4: Data Tampering & Cryptographic Verification
1. Open patient **P-1001** and click **"Verify Record Integrity"**.
2. Flask computes the canonical SHA-256 hash and compares it with the Ethereum smart contract anchor: Output: **"INTEGRITY VERIFIED: Match"**.
3. Click **"Simulate DB Tamper"** (simulates a rogue admin altering the prescription directly in SQLite without updating the blockchain).
4. Re-run verification: Output: **"CRITICAL WARNING: Tamper Detected! Computed hash does not match blockchain record!"**

---

## 9. Smart Contract Technical Specification (`HealthcareAccess.sol`)

- `registerPatientRecord(patientCode, recordHash)`: Anchors active SHA-256 hash.
- `verifyRecordHash(patientCode, testHash)`: Returns `(isMatch, storedHash, timestamp)`.
- `recordAccessEvent(...)`: Appends event to immutable EVM storage.
- `grantDoctorPermission(...)` & `revokeDoctorPermission(...)`: Smart contract RBAC rules.
- `getAuditTrail(patientCode)`: Chronological audit history query.

---

## 10. Machine Learning Architecture (`ml/detector.py`)

- **Model:** scikit-learn `IsolationForest(n_estimators=150, contamination=0.08, random_state=42)`
- **Extracted Features:**
  - `records_accessed_last_10m`: Velocity indicator
  - `denied_requests_count`: Access probing indicator
  - `failed_logins_last_hour`: Brute-force indicator
  - `hour_of_day`: Shift window (deep night hours 01:00-04:00 flagged)
  - `average_time_per_record_sec`: Machine scraping vs human reading speed
- **Output:** Anomaly Score $[-1.0, 1.0]$ and Normalized Risk Index $[0.0, 1.0]$.

---

## 11. Security Model & Prototype Limitations

1. **Academic Scope:** Designed for LAN evaluation on private Wi-Fi; not exposed to the public internet.
2. **Private Keys:** The private key in `.env.example` is the standard well-known Ganache test account. It possesses zero monetary value and must never be used on public mainnets.
3. **Data Privacy:** Raw Protected Health Information (PHI) is intentionally excluded from the blockchain to prevent permanent cryptographic exposure.

---

## 12. Troubleshooting Common Issues

- **Ganache Connection Refused:** Ensure `ganache --port 8545 --networkId 1337` is running in Terminal 1.
- **Port 5000 Already in Use:** Stop any existing Python or Flask instances: `taskkill /F /IM python.exe`.
- **LAN Device Cannot Load Page:** Run the PowerShell firewall rule from Step 7 as Administrator.
