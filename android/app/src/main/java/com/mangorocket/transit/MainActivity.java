package com.mangorocket.transit;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebResourceRequest;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.os.Message;

import androidx.annotation.NonNull;

import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

import java.util.concurrent.atomic.AtomicBoolean;

// 웹으로 만든 게임(assets/index.html)을 전체 화면 웹뷰에 띄우고, AndroidAds 다리로 AdMob 광고를 보여 준다
public class MainActivity extends Activity {
    private WebView web;
    private final Handler main = new Handler(Looper.getMainLooper());

    private ConsentInformation consent;
    private final AtomicBoolean adsStarted = new AtomicBoolean(false);
    private RewardedAd rewarded;
    private InterstitialAd interstitial;
    private boolean loadingRewarded, loadingInterstitial;
    // 광고를 띄운 동안에는 게임을 멈추되 웹뷰 타이머는 멈추지 않는다.
    // pauseTimers()는 앱 안의 모든 웹뷰(광고 화면 포함)를 멈춰서 광고 닫기 버튼이 나오지 않게 된다
    private boolean adShowing;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                    // 저장과 이어하기(localStorage)
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);                              // 시스템 글자 크기 설정에 화면이 깨지지 않게
        s.setSupportMultipleWindows(true);               // window.open을 받아서 외부 브라우저로 넘긴다
        web.setWebViewClient(new WebViewClient() {
            // 게임 파일(file://) 밖의 주소는 웹뷰 안이 아니라 외부 브라우저로 연다
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("file".equals(u.getScheme())) return false;
                openExternal(u);
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onCreateWindow(WebView v, boolean dialog, boolean user, Message msg) {
                WebView tmp = new WebView(MainActivity.this);
                tmp.setWebViewClient(new WebViewClient() {
                    @Override public boolean shouldOverrideUrlLoading(WebView w, WebResourceRequest r) {
                        openExternal(r.getUrl()); w.destroy(); return true;
                    }
                });
                ((WebView.WebViewTransport) msg.obj).setWebView(tmp);
                msg.sendToTarget();
                return true;
            }
        });
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setBackgroundColor(0xFFD5D9C2);
        web.addJavascriptInterface(new AdBridge(), "AndroidAds");
        web.addJavascriptInterface(new VibBridge(), "AndroidVib");
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
        hideBars();
        requestConsentThenStartAds();
    }

    // ---------- 광고 동의(UMP) → 광고 초기화 ----------
    private void requestConsentThenStartAds() {
        consent = UserMessagingPlatform.getConsentInformation(this);
        ConsentRequestParameters params = new ConsentRequestParameters.Builder().build();
        consent.requestConsentInfoUpdate(this, params,
            () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(this, formError -> {
                if (consent.canRequestAds()) startAds();
            }),
            requestError -> { if (consent.canRequestAds()) startAds(); });
        // 이전 실행에서 이미 동의를 받았다면 바로 시작한다
        if (consent.canRequestAds()) startAds();
    }

    private void startAds() {
        if (adsStarted.getAndSet(true)) return;
        new Thread(() -> MobileAds.initialize(this, status -> main.post(() -> {
            loadRewarded();
            loadInterstitial();
        }))).start();
    }

    private void loadRewarded() {
        if (rewarded != null || loadingRewarded || !adsStarted.get()) return;
        loadingRewarded = true;
        RewardedAd.load(this, BuildConfig.AD_REWARDED, new AdRequest.Builder().build(), new RewardedAdLoadCallback() {
            @Override public void onAdLoaded(@NonNull RewardedAd ad) { rewarded = ad; loadingRewarded = false; }
            @Override public void onAdFailedToLoad(@NonNull LoadAdError e) {
                rewarded = null; loadingRewarded = false;
                main.postDelayed(MainActivity.this::loadRewarded, 30000);   // 잠시 뒤 다시 시도
            }
        });
    }

    private void loadInterstitial() {
        if (interstitial != null || loadingInterstitial || !adsStarted.get()) return;
        loadingInterstitial = true;
        InterstitialAd.load(this, BuildConfig.AD_INTERSTITIAL, new AdRequest.Builder().build(), new InterstitialAdLoadCallback() {
            @Override public void onAdLoaded(@NonNull InterstitialAd ad) { interstitial = ad; loadingInterstitial = false; }
            @Override public void onAdFailedToLoad(@NonNull LoadAdError e) {
                interstitial = null; loadingInterstitial = false;
                main.postDelayed(MainActivity.this::loadInterstitial, 60000);
            }
        });
    }

    // 보상형: 끝까지 보면 onAdResult(id, true)
    private void showRewarded(String id) {
        RewardedAd ad = rewarded;
        if (ad == null) { sendResult(id, false, "notready"); loadRewarded(); return; }
        rewarded = null;
        adShowing = true;
        final boolean[] earned = { false };
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override public void onAdDismissedFullScreenContent() {
                adShowing = false;
                sendResult(id, earned[0], earned[0] ? "" : "closed");
                loadRewarded();
            }
            @Override public void onAdFailedToShowFullScreenContent(@NonNull AdError e) {
                adShowing = false;
                sendResult(id, false, "error");
                loadRewarded();
            }
        });
        ad.show(this, item -> earned[0] = true);
    }

    private void showInterstitial() {
        InterstitialAd ad = interstitial;
        if (ad == null) { js("window.onAdClosed && onAdClosed()"); loadInterstitial(); return; }
        interstitial = null;
        adShowing = true;
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override public void onAdDismissedFullScreenContent() { adShowing = false; js("window.onAdClosed && onAdClosed()"); loadInterstitial(); }
            @Override public void onAdFailedToShowFullScreenContent(@NonNull AdError e) { adShowing = false; js("window.onAdClosed && onAdClosed()"); loadInterstitial(); }
        });
        ad.show(this);
    }

    private void sendResult(String id, boolean ok, String why) {
        js("window.onAdResult && onAdResult('" + id + "'," + ok + ",'" + why + "')");
    }

    private void openExternal(Uri u) {
        String sc = u.getScheme();
        if (!"https".equals(sc) && !"http".equals(sc)) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
    }

    private void js(String code) { main.post(() -> web.evaluateJavascript(code, null)); }

    // 게임(자바스크립트)에서 부르는 다리. 웹뷰 스레드에서 불리므로 화면 스레드로 넘긴다
    private class AdBridge {
        @JavascriptInterface public void showRewarded(String id) {
            String safe = id == null ? "" : id.replaceAll("[^A-Za-z0-9_]", "");
            main.post(() -> MainActivity.this.showRewarded(safe));
        }
        @JavascriptInterface public void showInterstitial() { main.post(MainActivity.this::showInterstitial); }
        @JavascriptInterface public boolean isRewardedReady() { return rewarded != null; }
        // 동의가 필요한 지역(유럽 등)이면 설정 화면에 '광고 개인정보 설정'을 보여 준다
        @JavascriptInterface public boolean isPrivacyOptionsRequired() {
            return consent != null && consent.getPrivacyOptionsRequirementStatus()
                == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED;
        }
        @JavascriptInterface public void showPrivacyOptions() {
            main.post(() -> UserMessagingPlatform.showPrivacyOptionsForm(MainActivity.this, err -> {}));
        }
    }

    // 진동. 웹뷰의 navigator.vibrate는 안드로이드가 '터치 진동'으로 분류해서,
    // 휴대폰에서 '터치 시 진동'을 꺼 두면 세기가 0이 된다. 그래서 앱에서는 직접 진동을 부른다
    private class VibBridge {
        @JavascriptInterface public void vibrate(String csv) {
            Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator() || csv == null) return;
            String[] parts = csv.split(",");
            long[] p = new long[parts.length + 1];          // 맨 앞은 기다리는 시간(0)
            try { for (int i = 0; i < parts.length; i++) p[i + 1] = Math.max(0, Math.min(1000, Long.parseLong(parts[i].trim()))); }
            catch (NumberFormatException e) { return; }
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(p, -1));
            else v.vibrate(p, -1);
        }
    }

    // ---------- 화면 ----------
    // 상태 표시줄과 내비게이션 바를 숨긴다
    private void hideBars() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideBars();
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.evaluateJavascript("window.appPause && appPause()", null);   // 저장하고 멈춘 뒤 소리를 끈다
        if (adShowing) return;                                            // 광고 화면 웹뷰까지 멈추지 않게
        web.onPause();
        web.pauseTimers();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.resumeTimers();
        web.onResume();
        web.evaluateJavascript("window.appResume && appResume()", null);
    }

    // 뒤로 가기는 앱을 끄지 않고 뒤로 보낸다(진행 중인 판을 지키기 위해)
    @Override
    public void onBackPressed() {
        moveTaskToBack(true);
    }
}
