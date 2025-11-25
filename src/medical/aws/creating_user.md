# IAM User Creation - One-Page Cheat Sheet

## 🎯 Goal: Create a user with access keys for AWS CLI

---

## 📍 The Path (What You'll Click)

```
AWS Console Home
    ↓
Search: "IAM" → Click IAM
    ↓
Left Sidebar: Click "Users"
    ↓
Click "Create user" button
    ↓
Enter name: "deployment-user" → Next
    ↓
Select "Attach policies directly"
Search: "AdministratorAccess" → Check it → Next
    ↓
Click "Create user"
    ↓
Click on "deployment-user"
    ↓
Click "Security credentials" tab
    ↓
Click "Create access key"
    ↓
Select "Command Line Interface (CLI)" → Check box → Next
    ↓
Click "Create access key"
    ↓
Download .csv file → Done
```


---

## 🖥️ Then Configure AWS CLI

Open PowerShell:

```powershell
aws configure
```

Paste when prompted:
- AWS Access Key ID [None]: <your key>
- AWS Secret Access Key [None]: <your key>
- Default region name [None]: sa-east-1
- Default output format [None]: json

Test:
```powershell
aws sts get-caller-identity
```

