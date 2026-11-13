#!/usr/bin/env bash
# 웹 게임을 안드로이드 앱(APK)으로 포장한다. Gradle 없이 SDK 도구만 쓴다.
# 실행: bash android/build.sh   (transit-proto 폴더에서)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
A="$ROOT/android"
SDK="${ANDROID_HOME:-$LOCALAPPDATA/Android/Sdk}"
BT="$SDK/build-tools/35.0.1"
JAR="$SDK/platforms/android-35/android.jar"
OUT="$A/build"

mkdir -p "$OUT/assets/sprites" "$OUT/res/mipmap-xxhdpi" "$OUT/gen" "$OUT/classes" "$OUT/dex"

# 1. 게임 파일을 assets로 복사. 앱 안에서는 캐시 문제가 없으니 ?v= 표시는 뗀다
sed -E 's/\.js\?v=[0-9]+/.js/g' "$ROOT/index.html" > "$OUT/assets/index.html"
cp "$ROOT/audio.js" "$ROOT/render.js" "$OUT/assets/"
cp "$ROOT"/sprites/*.png "$OUT/assets/sprites/"

# 2. 아이콘
python "$A/make_icon.py" "$OUT/res/mipmap-xxhdpi/ic_launcher.png"

# 3. 리소스 묶기
"$BT/aapt2" compile --dir "$OUT/res" -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$JAR" --manifest "$A/AndroidManifest.xml" \
  -A "$OUT/assets" --java "$OUT/gen" "$OUT/res.zip"

# 4. 자바 컴파일 → dex
javac -encoding UTF-8 -source 11 -target 11 -nowarn -cp "$JAR" -d "$OUT/classes" \
  $(find "$A/src" "$OUT/gen" -name '*.java')
"$BT/d8.bat" --lib "$JAR" --min-api 24 --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')

# 5. dex를 넣고 정렬·서명
cp "$OUT/base.apk" "$OUT/unaligned.apk"
(cd "$OUT/dex" && python -c "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],'a',zipfile.ZIP_DEFLATED); z.write('classes.dex'); z.close()" "$OUT/unaligned.apk")
"$BT/zipalign" -f 4 "$OUT/unaligned.apk" "$OUT/aligned.apk"

KS="$HOME/.android/debug.keystore"
if [ ! -f "$KS" ]; then
  mkdir -p "$HOME/.android"
  keytool -genkeypair -keystore "$KS" -storepass android -keypass android -alias androiddebugkey \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
fi
"$BT/apksigner.bat" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android \
  --out "$OUT/transit.apk" "$OUT/aligned.apk"
echo "APK: $OUT/transit.apk"
