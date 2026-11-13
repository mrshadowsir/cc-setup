#!/usr/bin/env node
'use strict';
/* ccs APK builder.
   ccs apk new <naam> [--web <folder>] [--out <base>]   naya Android project (WebView app)
   ccs apk cloud [folder]    GitHub Actions par build (Termux ke liye best, SDK nahi chahiye)
   ccs apk local [folder]    apne device par build (Gradle + Android SDK chahiye)  */
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const HOME = os.homedir();
const say = m => console.log(m);
const die = m => { console.log('[!] ' + m); process.exit(1); };
const sh = (c, cwd) => cp.execSync(c, { stdio: 'inherit', cwd });
const out = (c, cwd) => cp.execSync(c, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const has = c => { try { cp.execSync((process.platform === 'win32' ? 'where ' : 'command -v ') + c, { stdio: 'ignore' }); return true; } catch { return false; } };
const sleepSync = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const pkgOf = n => 'com.ccs.' + (String(n).toLowerCase().replace(/[^a-z0-9]/g, '') || 'app').replace(/^(\d)/, 'a$1');

const WORKFLOW = `name: Build APK
on:
  push:
  workflow_dispatch:
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'
      - uses: android-actions/setup-android@v3
      - uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: '8.7'
      - name: Build debug APK
        run: |
          if [ -f ./gradlew ]; then chmod +x ./gradlew && ./gradlew assembleDebug --no-daemon; else gradle assembleDebug --no-daemon; fi
      - uses: actions/upload-artifact@v4
        with:
          name: apk
          path: '**/build/outputs/apk/**/*.apk'
`;

function write(f, s) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); }

function scaffold(name, base, web) {
  const dir = path.join(base, name), pkg = pkgOf(name);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) die('Folder pehle se hai aur khali nahi: ' + dir);
  write(path.join(dir, 'settings.gradle'), `pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositories { google(); mavenCentral() } }
rootProject.name = "${name}"
include ':app'
`);
  write(path.join(dir, 'build.gradle'), `plugins { id 'com.android.application' version '8.5.2' apply false }\n`);
  write(path.join(dir, 'gradle.properties'), `org.gradle.jvmargs=-Xmx2g\n`);
  write(path.join(dir, '.gitignore'), `build/\n.gradle/\napk-out/\nlocal.properties\n.idea/\n`);
  write(path.join(dir, 'app', 'build.gradle'), `plugins { id 'com.android.application' }
android {
    namespace '${pkg}'
    compileSdk 34
    defaultConfig {
        applicationId '${pkg}'
        minSdk 24
        targetSdk 34
        versionCode 1
        versionName '1.0'
    }
    buildTypes { release { minifyEnabled false } }
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
}
`);
  write(path.join(dir, 'app', 'src', 'main', 'AndroidManifest.xml'), `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET"/>
    <application android:label="${esc(name)}" android:usesCleartextTraffic="true"
        android:theme="@android:style/Theme.DeviceDefault.NoActionBar">
        <activity android:name=".MainActivity" android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>
    </application>
</manifest>
`);
  write(path.join(dir, 'app', 'src', 'main', 'java', ...pkg.split('.'), 'MainActivity.java'), `package ${pkg};

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
}
`);
  const www = path.join(dir, 'app', 'src', 'main', 'assets', 'www');
  if (web) {
    const w = path.resolve(web);
    if (!fs.existsSync(w) || !fs.statSync(w).isDirectory()) die('Web folder nahi mila: ' + w);
    fs.mkdirSync(www, { recursive: true });
    fs.cpSync(w, www, { recursive: true });
    if (!fs.existsSync(path.join(www, 'index.html'))) say('[!] Dhyan do: web folder me index.html nahi hai, app khali dikhega');
  } else {
    write(path.join(www, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:20px system-ui;color:#fff;background:linear-gradient(135deg,#7c5cff,#18c7ff)}
div{text-align:center;padding:24px}small{opacity:.8}</style></head>
<body><div><h1>${esc(name)}</h1><p>Ye tumhara APK app hai.</p><small>app/src/main/assets/www/index.html badlo</small></div></body></html>
`);
  }
  write(path.join(dir, '.github', 'workflows', 'apk.yml'), WORKFLOW);
  say('[ok] Project ban gaya: ' + dir);
  say('     Ab APK banane ke liye: ccs apk cloud "' + dir + '"');
}

function ensureWorkflow(dir) {
  const f = path.join(dir, '.github', 'workflows', 'apk.yml');
  if (!fs.existsSync(f)) { write(f, WORKFLOW); say('[ok] Build workflow add hua'); }
  const gi = path.join(dir, '.gitignore');
  if (!fs.existsSync(gi)) write(gi, 'build/\n.gradle/\napk-out/\nlocal.properties\n.idea/\n');
}

function findApks(root) {
  const res = [];
  (function walk(d, depth) {
    if (depth > 8) return;
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1); else if (/\.apk$/i.test(e.name)) res.push(p);
    }
  })(root, 0);
  return res;
}

function finish(dir, apks, name) {
  if (!apks.length) die('APK file nahi mili. Build log upar dekho.');
  const apk = apks[0], show = [apk];
  const dl = path.join(HOME, 'storage', 'downloads');
  if (fs.existsSync(dl)) { const t = path.join(dl, name + '-debug.apk'); fs.copyFileSync(apk, t); show.unshift(t); }
  say('\n[ok] APK taiyar!');
  show.forEach(p => say('     ' + p));
  say('     Install: Files app > Downloads > APK par tap > "Unknown sources" allow karo.');
  if (!fs.existsSync(dl) && process.env.PREFIX && process.env.PREFIX.includes('com.termux')) say('     Tip: ek baar `termux-setup-storage` chalao, to APK seedha Downloads me aayegi.');
}

function cloud(dir) {
  if (!has('git')) die('git nahi hai. Termux: pkg install git');
  if (!has('gh')) die('GitHub CLI nahi hai. Termux: pkg install gh   |   Windows: winget install GitHub.cli');
  try { out('gh auth status'); } catch { die('Pehle GitHub login karo (ek baar): gh auth login'); }
  ensureWorkflow(dir);
  const name = (path.basename(dir).replace(/[^\w.-]/g, '-') || 'apk-app');
  try { if (!out('git config user.email', dir)) throw 0; } catch { sh('git config user.email "ccs@users.noreply.github.com"', dir); sh('git config user.name "ccs"', dir); }
  if (!fs.existsSync(path.join(dir, '.git'))) sh('git init -b main', dir);
  try { sh('git add -A', dir); out('git commit -m "apk build"', dir); } catch { /* kuch naya nahi */ }
  let remote = ''; try { remote = out('git remote get-url origin', dir); } catch { /* nahi hai */ }
  say('[*] GitHub par bhej raha hu…');
  try {
    if (!remote) sh(`gh repo create ${name} --private --source . --remote origin --push`, dir);
    else sh('git push -u origin HEAD', dir);
  } catch { die('GitHub push nahi hua. Repo naam pehle se ho to folder ka naam badlo, ya gh auth login dobara karo.'); }
  const sha = out('git rev-parse HEAD', dir);
  say('[*] Cloud build shuru hone ka intezaar…');
  let id = '';
  for (let i = 0; i < 20 && !id; i++) { try { id = out(`gh run list --commit ${sha} --limit 1 --json databaseId -q ".[0].databaseId"`, dir); } catch { /* abhi nahi */ } if (!id) sleepSync(4000); }
  if (!id) die('Build shuru nahi hua. GitHub repo ke Actions tab me dekho.');
  say('[*] Build chal raha hai (2-5 minute)…');
  try { sh(`gh run watch ${id} --exit-status`, dir); } catch { die('Build fail hua. Dekho: gh run view ' + id + ' --log-failed'); }
  const o = path.join(dir, 'apk-out'); fs.rmSync(o, { recursive: true, force: true });
  sh(`gh run download ${id} -n apk -D "${o}"`, dir);
  finish(dir, findApks(o), name);
}

function local(dir) {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const gw = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const useW = fs.existsSync(path.join(dir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'));
  if (!has('java')) die('Java (JDK 17) nahi mila. Local build ke liye JDK chahiye.');
  if (!useW && !has('gradle')) die('Gradle nahi mila. Cloud build try karo: ccs apk cloud');
  if (!sdk) die('ANDROID_HOME set nahi hai (Android SDK nahi mila). Termux par cloud build use karo: ccs apk cloud');
  say('[*] Local build shuru…');
  try { sh((useW ? gw : 'gradle') + ' assembleDebug --no-daemon', dir); } catch { die('Build fail hua. Upar ka error dekho.'); }
  const o = path.join(dir, 'apk-out'); fs.mkdirSync(o, { recursive: true });
  const apks = findApks(dir).filter(p => !p.includes('apk-out') && /build[\\/]outputs/.test(p));
  apks.forEach(p => fs.copyFileSync(p, path.join(o, path.basename(p))));
  finish(dir, findApks(o), path.basename(dir));
}

const [cmd, ...a] = process.argv.slice(2);
const flag = n => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : ''; };
if (cmd === 'new') {
  const name = a[0];
  if (!name || !/^[\w-]{1,40}$/.test(name)) die('Naam likho (English akshar/number/-/_). Jaise: ccs apk new MeraApp');
  scaffold(name, path.resolve(flag('--out') || process.cwd()), flag('--web'));
} else if (cmd === 'cloud' || cmd === 'local') {
  const dir = path.resolve(a[0] || process.cwd());
  if (!fs.existsSync(dir)) die('Folder nahi mila: ' + dir);
  if (!fs.existsSync(path.join(dir, 'settings.gradle')) && !fs.existsSync(path.join(dir, 'settings.gradle.kts'))) die('Is folder me Android project nahi hai (settings.gradle nahi mila). Naya banao: ccs apk new NAAM');
  (cmd === 'cloud' ? cloud : local)(dir);
} else {
  say(`ccs apk new NAAM [--web FOLDER]   naya app project (web folder ho to uska app ban jata hai)
ccs apk cloud [FOLDER]            GitHub par build, APK wapas aati hai (Termux ke liye best)
ccs apk local [FOLDER]            device par build (JDK + Gradle + Android SDK chahiye)`);
}
