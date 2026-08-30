# Google Sheets Gold & SGB Auto-Updater

> 🤖 **100% AI-Generated Code**: This entire project, including script logic, API integrations, and documentation, was generated using an AI coding assistant.

A standalone, lightweight Node.js executable script designed to run via `cron` on Linux (Fedora, Ubuntu, Debian, etc.). It fetches real-time international Spot Gold rates along with National Stock Exchange (NSE) Sovereign Gold Bond (SGB) quotes, and writes them directly into a designated Google Sheet.

---

## Features

- **Spot Gold Metrics**: Fetches Spot Gold (XAU/USD) price, price change, and percentage change.
- **NSE Bond Quotes**: Concurrently fetches real-time bond data (Company Name, Last Traded Price) for multiple SGB symbols (`SGBJUL28IV`, `SGBFEB32IV`).
- **Batch Updates**: Updates all configured cells simultaneously in a single API call using Google Sheets API `v4`.
- **Zero Heavy Tooling**: Native ES Modules and native `fetch` (no Axios or heavy wrappers required).
- **Flexible Path Resolution**: Seamlessly expands `~`, `${HOME}`, relative, and absolute paths specified in `.env`.
- **Cron-Ready**: Designed for headless, automated background scheduling.

---

## Prerequisites

- **Node.js LTS** (v18 or higher with `npm` installed).
- A **Google Cloud Project** with the **Google Sheets API** enabled.
- A **Google Sheet** shared with the service account email as **Editor**.

---

## How to Get Google API Credentials (Service Account)

This script uses a **Google Cloud Service Account** to authenticate autonomously in background/cron jobs without requiring manual browser logins.

### 1. Create a Google Cloud Project & Enable API
1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or select an existing one).
3. Go to **APIs & Services > Library**.
4. Search for **Google Sheets API** and click **Enable**.

### 2. Create the Service Account
1. Go to **APIs & Services > Credentials**.
2. Click **Create Credentials** at the top and choose **Service Account**.
3. Enter a name (e.g., `sheets-cron-updater`) and click **Create and Continue**.
4. Skip the optional role and permission grants, then click **Done**.

### 3. Generate the JSON Key File
1. On the **Credentials** page, find your newly created service account under the **Service Accounts** table and click on its email address.
2. Go to the **Keys** tab.
3. Click **Add Key > Create new key**.
4. Select **JSON** as the key type and click **Create**.
5. Save the downloaded `.json` file securely.

### 4. Grant Access on Your Google Sheet
1. Copy the email address of your service account (e.g., `sheets-cron-updater@your-project-id.iam.gserviceaccount.com`).
2. Open the target Google Sheet in your browser.
3. Click the **Share** button in the upper-right corner.
4. Paste the service account email, select the **Editor** role, uncheck "Notify people", and click **Share**.

---

## Quickstart on a Fresh Machine

Assuming Node.js LTS is already installed on the target machine, run these commands:

### 1. Clone the Repository & Install Dependencies
```bash
git clone https://github.com/masoomshaikh/google-sheet-updater.git
cd google-sheet-updater
npm ci
chmod +x updater.js
