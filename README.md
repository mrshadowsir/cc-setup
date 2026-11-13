<p align="center">
  <img src="https://img.shields.io/badge/cc--setup-v4.8.1-7c5cff?style=for-the-badge&labelColor=0b1020" alt="cc-setup v4.8.1">
  <img src="https://img.shields.io/badge/Termux-Android-3DDC84?style=for-the-badge&logo=android&logoColor=white" alt="Termux">
  <img src="https://img.shields.io/badge/Windows-VS%20Code-0078D4?style=for-the-badge&logo=windows&logoColor=white" alt="Windows">
  <img src="https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node 18+">
  <img src="https://img.shields.io/badge/license-MIT-18c7ff?style=for-the-badge" alt="MIT">
</p>

<h1 align="center">⚡ cc-setup</h1>
<p align="center"><b>Claude Code + free API gateway + Plugin Center</b><br>
Phone, tablet aur computer, teeno par ek hi rangeen dashboard.</p>

<p align="center">
  <img src="https://img.shields.io/badge/📱_Phone-supported-38e08c?style=flat-square" alt="Phone">
  <img src="https://img.shields.io/badge/📲_Tablet-supported-ffc94d?style=flat-square" alt="Tablet">
  <img src="https://img.shields.io/badge/💻_Computer-supported-ff7ad9?style=flat-square" alt="Computer">
</p>

> [!TIP]
> Har command alag box me hai. Box ke upar **Copy** dabao. Ek box = ek step.

---

## 🗺️ Quick menu

| 🟦 Install | 🟩 Dashboard | 🟨 Plugins | 🟥 Update | 🟪 Extra |
|:--|:--|:--|:--|:--|
| [Termux (Android)](#-termux-android) | [Pehli setup](#-dashboard-pehli-setup) | [Plugin Center](#-plugin-center) | [Update karo](#-update) | [Commands](#-saare-commands) |
| [Windows (PC)](#-windows-vs-code) | [Layout](#-layout-phone--tablet--computer) | [Backup / restore](#-backup--restore) | [Doctor check](#-check-karo) | [Battery](#-battery-android) |

---

## 🟦 Termux (Android)

![STEP 1](https://img.shields.io/badge/STEP_1-F--Droid_se_Termux_lo-3DDC84?style=flat-square&labelColor=0b1020)

Termux **F-Droid** se install karo. Play Store wala purana hai.

![STEP 2](https://img.shields.io/badge/STEP_2-Packages_update-3DDC84?style=flat-square&labelColor=0b1020)

```
pkg update -y
```

![STEP 2b](https://img.shields.io/badge/STEP_2b-Packages_upgrade-3DDC84?style=flat-square&labelColor=0b1020)

```
pkg upgrade -y
```

![STEP 3](https://img.shields.io/badge/STEP_3-git_aur_curl-3DDC84?style=flat-square&labelColor=0b1020)

```
pkg install -y git curl
```

![STEP 4](https://img.shields.io/badge/STEP_4-Repo_download-3DDC84?style=flat-square&labelColor=0b1020)

```
git clone https://github.com/mrshadowsir/cc-setup ~/cc-setup
```

![STEP 5](https://img.shields.io/badge/STEP_5-Installer_chalao-3DDC84?style=flat-square&labelColor=0b1020)

```
bash ~/cc-setup/install.sh
```

![STEP 6](https://img.shields.io/badge/STEP_6-Agli_baar_sirf-3DDC84?style=flat-square&labelColor=0b1020)

```
ccs
```

> [!WARNING]
> `pkg update` fail ho to pehle `termux-change-repo` chalao, mirror badlo, phir STEP 2 dobara.

> [!CAUTION]
> **Error: `CANNOT LINK EXECUTABLE ... SSL_set_quic_tls_early_data_enabled`** ya **`fatal: remote helper 'https' aborted`**
> Ye packages ka mismatch hai. STEP 2b (`pkg upgrade -y`) chalao, phir:

```
pkg reinstall -y libcurl git curl
```

> [!TIP]
> **App me copy kaise karein:** Dashboard me ☰ menu kholo, **📖 Guide** dabao. Wahan har command ke saath **Copy** button hai.
> Ya GitHub app me command par lamba dabao, select karke copy karo.

---

## 🟦 Windows (VS Code)

![STEP 1](https://img.shields.io/badge/STEP_1-Node.js-0078D4?style=flat-square&labelColor=0b1020)

```
winget install OpenJS.NodeJS.LTS
```

![STEP 2](https://img.shields.io/badge/STEP_2-Git-0078D4?style=flat-square&labelColor=0b1020)

```
winget install Git.Git
```

![STEP 3](https://img.shields.io/badge/STEP_3-VS_Code_restart-0078D4?style=flat-square&labelColor=0b1020)

VS Code band karke dobara kholo, taaki naye PATH load ho jayein.

![STEP 4](https://img.shields.io/badge/STEP_4-Repo_download-0078D4?style=flat-square&labelColor=0b1020)

```
git clone https://github.com/mrshadowsir/cc-setup
```

![STEP 5](https://img.shields.io/badge/STEP_5-Folder_me_jao-0078D4?style=flat-square&labelColor=0b1020)

```
cd cc-setup
```

![STEP 6](https://img.shields.io/badge/STEP_6-Installer-0078D4?style=flat-square&labelColor=0b1020)

```
install.bat
```

![STEP 7](https://img.shields.io/badge/STEP_7-Agli_baar_sirf-0078D4?style=flat-square&labelColor=0b1020)

```
ccs
```

---

## 🟩 Dashboard pehli setup

Dono platform par ek hi jaisa.

| Step | Kya karna hai | Badge |
|:--:|--|--|
| **1** | Home tab > **Claude Install** dabao | ![1](https://img.shields.io/badge/1-7c5cff?style=flat-square) |
| **2** | **URL + API key > Save** | ![2](https://img.shields.io/badge/2-18c7ff?style=flat-square) |
| **3** | **Models > Models laao > Test > Lagao** | ![3](https://img.shields.io/badge/3-38e08c?style=flat-square) |
| **4** | Claude chalao (terminal me) | ![4](https://img.shields.io/badge/4-ffc94d?style=flat-square) |

```
ccs claude
```

---

## 🟨 Plugin Center

Dashboard me **🧩 Plugins** tab kholo. Upar 5 rangeen sections hain:

| Section | Kya milega | Color |
|:--|:--|:--:|
| 🛒 **Marketplace** | Saare plugins. Search. **Install** ek click, **🗑 Delete** ek click me permanent. | ![](https://img.shields.io/badge/-7c5cff?style=flat-square) |
| ✅ **Installed** | ● Active, ⏸ OFF, ⚠ Files gayab. ON/OFF toggle, Sab ON/OFF, Health check. | ![](https://img.shields.io/badge/-38e08c?style=flat-square) |
| 🔧 **Custom** | Official ke bahar ke plugins. Marketplace jodo, `plugin@marketplace` se install. | ![](https://img.shields.io/badge/-18c7ff?style=flat-square) |
| 🧪 **Advanced** | Backup / restore, marketplace update, skills ki list. | ![](https://img.shields.io/badge/-ffc94d?style=flat-square) |
| 📦 **Recommended** | plugins.json ki recommended list. | ![](https://img.shields.io/badge/-ff7ad9?style=flat-square) |

> [!NOTE]
> Pehli baar Marketplace section me neeche **Official marketplace jodo** dabao.

> [!CAUTION]
> **Permanent delete** me plugin ki files, cache aur settings entry sab hat jati hai. Wapas nahi aata, isliye confirm popup aata hai.

### Status ka matlab

| Status | Matlab |
|:--|:--|
| ![](https://img.shields.io/badge/●_Active-38e08c?style=flat-square&labelColor=0b1020) | Installed + ON + files maujood. Kaam kar raha hai. |
| ![](https://img.shields.io/badge/⏸_OFF-8a93b8?style=flat-square&labelColor=0b1020) | Installed hai, par band hai. |
| ![](https://img.shields.io/badge/⚠_Files_gayab-ff6b81?style=flat-square&labelColor=0b1020) | Settings me hai, par folder nahi mila. Reinstall ya Delete karo. |

---

## 💾 Backup & restore

| Kaam | Kaise |
|:--|:--|
| **Backup lo** | Plugins > 🧪 Advanced > **⬇ Backup file lo** |
| **Naye device par wapas** | Plugins > 🧪 Advanced > **⬆ Backup file se restore** |

Restore ke baad Logs tab me `job-mp-restore` dekho.

---

## 📐 Layout (phone / tablet / computer)

| Device | Layout | Navigation |
|:--|:--|:--|
| 📱 **Phone** | Ek column, sab ek screen par | Neeche bar |
| 📲 **Tablet** (700px+) | Chaudi layout | Neeche bar |
| 💻 **Computer** (1024px+) | Plugin Center 2 columns | Bayein sidebar |

**Full screen app ki tarah:** Chrome me `⋮ > Install app` karo. Phir ye alag app ki tarah khulta hai.

---

## 🔄 Update

![UPDATE 1](https://img.shields.io/badge/UPDATE_1-Dashboard_se-ff7ad9?style=flat-square&labelColor=0b1020)

Home tab > **Update karo** dabao.

![UPDATE 2](https://img.shields.io/badge/UPDATE_2-Ya_terminal_se-ff7ad9?style=flat-square&labelColor=0b1020)

```
ccs update
```

![UPDATE 3](https://img.shields.io/badge/UPDATE_3-5_second_ruko-ff7ad9?style=flat-square&labelColor=0b1020)

5 second ruko, phir browser me page reload karo.

---

## 🧪 Check karo

```
ccs doctor
```

Sab check karta hai. Kuch laal aaye to uska `fix` line padho.

---

## 📜 Saare commands

| Command | Kaam |
|:--|:--|
| `ccs` | Dashboard + menu (background me) |
| `ccs claude` | Claude Code chalao |
| `ccs menu` | Terminal menu (bina browser ke) |
| `ccs update` | Naya version GitHub se |
| `ccs battery` | Battery restriction hatao (Termux) |
| `ccs apk help` | APK banana ki help |
| `ccs doctor` | Sab check |
| `ccs stop` | Sab band |

<details>
<summary><b>🔌 Plugin commands (terminal se)</b></summary>

```
claude plugin marketplace add anthropics/claude-plugins-official
```

```
claude plugin install code-review@claude-plugins-official
```

```
claude plugin uninstall code-review@claude-plugins-official
```

```
claude plugin marketplace update
```

</details>

---

## 🔋 Battery (Android, ek baar)

```
ccs battery
```

Termux ke liye **No restrictions** chuno. Redmi/Xiaomi par **Autostart** ON karo, aur Recent apps me Termux ko **Lock** karo.

---

## 🤖 Model aur API

<details>
<summary><b>Model beech me band ho jaye to</b></summary>

Proxy (`127.0.0.1:8788`) 2 baar khud retry karta hai, phir request roke rakhta hai. Dashboard par laal box aata hai. Naya model chuno, kaam wahin se aage badhta hai.

</details>

<details>
<summary><b>Direct API (Gemini, Groq wagairah)</b></summary>

Home > Provider me chuno, key daalo, **Save**. `~/.claude/settings.json` me asli key nahi rehti, isliye hamesha `ccs claude` se chalao.

</details>

---

## 📦 APK banana

```
ccs apk new MeraApp
```

Cloud build (GitHub Actions, Termux ke liye best):

```
ccs apk cloud ~/apk-projects/MeraApp
```

Cloud build ke liye ek baar Plugins > Recommended me **APK Builder** install karo, phir:

```
gh auth login
```

---

## ⚠️ Known limits

> [!IMPORTANT]
> - Termux par Claude Code `2.1.112` pin hota hai. Badalna ho to `CC_CLAUDE_VER` set karo.
> - Android battery system phone ke hisaab se alag hai. Process maare to `ccs battery` dobara chalao.
> - Local APK build Termux par practical nahi, isliye cloud build default hai.
> - Free providers ke models roz badalte hain. Hub > Models me dobara test karo.
> - Kuch free providers prompts training me use kar sakte hain. **Private code/data mat bhejo.**
> - Plugin status naye Claude session me lagta hai.

---

## 🗂️ Files

`cc.js` · `plugins-hub.js` · `proxy.js` · `preview.js` · `apk.js` · `dash.html` · `providers.json` · `plugins.json` · `package.json` · `install.sh` · `install.bat` · `README.md` · `README.html`

<p align="center"><sub>MIT License · Made for Termux & Windows 💜</sub></p>
