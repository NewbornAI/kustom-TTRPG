package com.newbornai.customsheet;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.Manifest;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

/**
 * The page and the data travel in the assets. This shell gives them a window,
 * a dark background, a storage area for the saved state, and a local origin:
 * a page cannot read a file next to it, so the shell answers for the assets
 * itself. The library of spells and features is read when the app asks for
 * it, so a launch only pays for the character being played.
 */
public class MainActivity extends Activity {

    private static final String ORIGIN = "https://sheet.local/";
    private static final int PICK = 41;
    private static final int PICK_IMAGE = 42;
    private static final int CAMERA_ASK = 43;
    private static final int VOID = 0xff08070f;

    private WebView view;
    /* Set when the window pauses: the installer really came up over it. */
    volatile boolean installSeen = false;
    private String pickedText = "";
    private ValueCallback<Uri[]> filePath;
    /* The camera the page asked for, held while the phone asks the player. */
    private PermissionRequest cameraAsk;

    /* The page scans the QR code of an invite with the camera: the WebView
       asks, and the phone asks the player once. Only the camera is ever
       granted, and only to the page of the app. */
    void askCamera(PermissionRequest request) {
        boolean video = false;
        for (String r : request.getResources()) if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) video = true;
        if (!video) { request.deny(); return; }
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
            return;
        }
        cameraAsk = request;
        requestPermissions(new String[] { Manifest.permission.CAMERA }, CAMERA_ASK);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] names, int[] results) {
        super.onRequestPermissionsResult(code, names, results);
        if (code != CAMERA_ASK || cameraAsk == null) return;
        PermissionRequest held = cameraAsk;
        cameraAsk = null;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            held.grant(new String[] { PermissionRequest.RESOURCE_VIDEO_CAPTURE });
        } else {
            held.deny();
        }
    }

    /* The words on the clipboard, read when the player taps to join, so an
       invite copied from a message comes in without a field to paste into. */
    String clipboardText() {
        try {
            ClipboardManager clip = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (clip == null || !clip.hasPrimaryClip()) return "";
            ClipData data = clip.getPrimaryClip();
            if (data == null || data.getItemCount() == 0) return "";
            CharSequence text = data.getItemAt(0).coerceToText(this);
            return text == null ? "" : text.toString();
        } catch (Exception e) {
            return "";
        }
    }

    @Override
    protected void onPause() {
        installSeen = true;
        super.onPause();
    }

    /* The words of the file the player picked. */
    public String pickedWords() {
        return pickedText;
    }

    /* The answer of a call that ran off the thread of the page goes back to
       the page, which was not held while it ran. */
    void deliver(String id, String result) {
        runOnUiThread(new Deliver(this, id, result == null ? "" : result));
    }

    /* A named class and not an anonymous one: d8 in build-tools 34.0.0 dies
       on an anonymous class in this file. */
    private static class Deliver implements Runnable {

        private final MainActivity host;
        private final String id;
        private final String result;

        Deliver(MainActivity host, String id, String result) {
            this.host = host;
            this.id = id;
            this.result = result;
        }

        public void run() {
            if (host.view == null) return;
            host.view.evaluateJavascript("window.__sheetNetDone && window.__sheetNetDone("
                + org.json.JSONObject.quote(id) + "," + org.json.JSONObject.quote(result) + ")", null);
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(VOID);
        getWindow().setNavigationBarColor(VOID);

        view = new WebView(this);
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        /* The camera of the QR scan plays in a video of the page, after the
           phone has asked the player, which is past the tap that started it. */
        settings.setMediaPlaybackRequiresUserGesture(false);

        view.setBackgroundColor(VOID);
        view.setOverScrollMode(View.OVER_SCROLL_NEVER);
        view.setVerticalScrollBarEnabled(false);
        view.setHorizontalScrollBarEnabled(false);
        view.setWebViewClient(new ShellClient(this));
        /* A file control of the page asks the window of the phone for its
           chooser: the same control then works on the web and in the app. */
        view.setWebChromeClient(new ChooserClient(this));
        /* The page asks the shell for a file that sits in the assets: a page
           cannot read one by itself, and the network is not there to fetch
           it. */
        view.addJavascriptInterface(new AssetBridge(this), "SheetShell");
        view.addJavascriptInterface(new FetchBridge(this), "SheetNet");

        setContentView(view);
        view.loadUrl(ORIGIN + "index.html");
    }

    /* The player picked a file: the page is told the name of it and asks for
       the words through the bridge. A file control of the page is different:
       the picked file is handed straight back to the control. */
    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_IMAGE) {
            Uri picked = (result == RESULT_OK && data != null) ? data.getData() : null;
            takeFile(picked == null ? null : new Uri[] { picked });
            return;
        }
        if (request != PICK || result != RESULT_OK || data == null || data.getData() == null) return;
        try {
            InputStream in = getContentResolver().openInputStream(data.getData());
            if (in == null) return;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] chunk = new byte[16384];
            int n;
            while ((n = in.read(chunk)) > 0) out.write(chunk, 0, n);
            in.close();
            pickedText = out.toString("UTF-8");
            view.evaluateJavascript("window.__sheetPicked && window.__sheetPicked('package.json')", null);
        } catch (Exception e) {
            pickedText = "";
        }
    }

    /* The back key is the page's first: it closes what is open over the page,
       leaves the settings, or takes back the last change, the way the rewind
       does. Only when the page has nothing to undo does the app step aside,
       to the background and not closed, so a back pressed once too often at
       the table loses nothing. */
    @Override
    public void onBackPressed() {
        if (view == null) {
            super.onBackPressed();
            return;
        }
        /* A lambda and not a class of this file: d8 in build-tools 34.0.0
           dies on a class here that implements ValueCallback, and a lambda is
           desugared after d8 has read the class, not before. */
        view.evaluateJavascript("(window.__sheetBack ? window.__sheetBack() : 'none')", answer -> {
            if (answer == null || answer.indexOf("none") >= 0) moveTaskToBack(true);
        });
    }

    /* Reads a file out of the assets for the page. */
    private static class AssetBridge {

        private final MainActivity host;

        AssetBridge(MainActivity host) {
            this.host = host;
        }

        @JavascriptInterface
        public String read(String name) {
            if (name == null) return null;
            String path = name.replace("\\", "/");
            while (path.startsWith("/")) path = path.substring(1);
            path = path.replace("..", "");
            /* The assets are packed flat, because aapt2 on a windows machine
               writes a backslash into the name of an asset that sits in a
               folder, and the phone then looks for a name that is not there. */
            String flat = path;
            int slash = flat.lastIndexOf('/');
            if (slash >= 0) flat = flat.substring(slash + 1);
            String[] names = path.equals(flat) ? new String[] { path } : new String[] { path, flat };
            for (String candidate : names) {
                try {
                    InputStream in = host.getAssets().open(candidate);
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] chunk = new byte[8192];
                    int n;
                    while ((n = in.read(chunk)) > 0) out.write(chunk, 0, n);
                    in.close();
                    return out.toString("UTF-8");
                } catch (IOException e) {
                    /* the next name */
                }
            }
            return null;
        }
    }

    /* Asks the machine that serves the app whether a newer build is there.
       The page cannot fetch it: the page is on its own origin and the
       answer comes from another one. */
    /* An intent goes up on the thread of the activity and not on the thread
       of the WebView, and the page is told whether it really started. It is
       a named class and not an anonymous one: d8 in build-tools 34.0.0 dies
       with a NullPointerException on an anonymous class in this file. */
    private static class Starter implements Runnable {

        private final MainActivity host;
        private final Intent intent;
        private final String[] answer;
        private final java.util.concurrent.CountDownLatch up;

        Starter(MainActivity host, Intent intent, String[] answer, java.util.concurrent.CountDownLatch up) {
            this.host = host;
            this.intent = intent;
            this.answer = answer;
            this.up = up;
        }

        public void run() {
            try {
                host.startActivity(intent);
            } catch (Exception e) {
                answer[0] = "error " + e.getClass().getSimpleName();
            } finally {
                up.countDown();
            }
        }
    }

    private static class FetchBridge {

        private final MainActivity host;
        /* The calls that go to the network run here, so the page is never
           held while one waits: a call answers at once and the result comes
           back through deliver. */
        private final java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newCachedThreadPool();

        FetchBridge(MainActivity host) {
            this.host = host;
        }

        @JavascriptInterface
        public String requestAsync(String id, String url, String method, String body, String token) {
            pool.execute(new Job(this, id, "request", new String[] { url, method, body, token }));
            return "pending";
        }

        @JavascriptInterface
        public String agentAsync(String id, String url, String body) {
            pool.execute(new Job(this, id, "agent", new String[] { url, body }));
            return "pending";
        }

        @JavascriptInterface
        public String fetchUrlAsync(String id, String url) {
            pool.execute(new Job(this, id, "fetchUrl", new String[] { url }));
            return "pending";
        }

        @JavascriptInterface
        public String downloadAsync(String id, String url) {
            pool.execute(new Job(this, id, "download", new String[] { url }));
            return "pending";
        }

        @JavascriptInterface
        public String installAsync(String id) {
            pool.execute(new Job(this, id, "install", new String[0]));
            return "pending";
        }

        /* The one place a job is told apart. */
        String run(String kind, String[] a) {
            if ("request".equals(kind)) return request(a[0], a[1], a[2], a[3]);
            if ("agent".equals(kind)) return agent(a[0], a[1]);
            if ("fetchUrl".equals(kind)) return fetchUrl(a[0]);
            if ("download".equals(kind)) return download(a[0]);
            if ("install".equals(kind)) return install();
            return "error unknown " + kind;
        }

        void done(String id, String result) {
            host.deliver(id, result);
        }

        /* The hosts a call with a token may reach: GitHub, and nothing else,
           so the token never leaves for another address. */
        private static boolean github(String url) {
            try {
                String h = new java.net.URL(url).getHost();
                return "github.com".equals(h) || "api.github.com".equals(h);
            } catch (Exception e) {
                return false;
            }
        }

        /* The app updates itself: the build is fetched into the private
           storage of the app and the installer of the phone is handed it.

           The file the answer advertised is the file it must have written: a
           build that arrived short is refused here and named, because the
           installer would only say that it cannot read the package. */
        @JavascriptInterface
        public String download(String url) {
            if (url == null) return null;
            try {
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                c.setConnectTimeout(5000);
                c.setReadTimeout(60000);
                c.setRequestMethod("GET");
                int code = c.getResponseCode();
                if (code < 200 || code > 299) {
                    c.disconnect();
                    return "error " + code;
                }
                long want = c.getContentLength();
                java.io.File file = new java.io.File(host.getFilesDir(), "update.apk");
                java.io.FileOutputStream out = new java.io.FileOutputStream(file);
                InputStream in = c.getInputStream();
                byte[] chunk = new byte[16384];
                int n;
                while ((n = in.read(chunk)) > 0) out.write(chunk, 0, n);
                in.close();
                out.close();
                c.disconnect();
                long got = file.length();
                if (want > 0 && got != want) return "error short " + got + " of " + want;
                return String.valueOf(got);
            } catch (Exception e) {
                return "error " + e.getClass().getSimpleName();
            }
        }

        /* An intent goes up on the thread of the activity and not on the
           thread of the WebView, and the answer says whether it really
           started, so the page knows when to fall back to the browser. */
        private String start(Intent intent) {
            String[] answer = { "ok" };
            java.util.concurrent.CountDownLatch up = new java.util.concurrent.CountDownLatch(1);
            host.runOnUiThread(new Starter(host, intent, answer, up));
            try {
                up.await(3, java.util.concurrent.TimeUnit.SECONDS);
            } catch (Exception e) {
                return "error " + e.getClass().getSimpleName();
            }
            return answer[0];
        }

        /* Hands the downloaded build to the installer of the phone, which
           always asks the player before it puts anything in place.

           One launch and one wait. The answer is the fact and not the attempt:
           startActivity not throwing only means the intent was accepted, and
           the window pausing is what says the installer came up. The wait is
           long because the installer has to start on the phone, and a second
           launch made during that start is what broke the update: it
           re-delivers the intent to the installer's task while the first
           launch is still coming up, and the installer then shows no dialog at
           all. The player's own second tap is the recovery, and it is instant,
           so this says the truth and leaves the tap to the player. */
        @JavascriptInterface
        public String install() {
            java.io.File file = new java.io.File(host.getFilesDir(), "update.apk");
            if (!file.exists() || file.length() == 0) return "error nothing downloaded";
            /* The installer runs in a task of its own, always a new one, at an
               address new for every build.

               A new task alone (NEW_TASK) let the phone find the installer task
               of the last update, whose first intent was this same one, and only
               bring that old task forward: the window paused, the stale task
               closed, and no dialog came; the second tap worked. Started in this
               app's own task instead, the dialog came on the first tap, but the
               installer then sat in the task the update replaces: its Open
               launched the app into that task, which only brought the installer's
               last screen forward, and the app did not open. MULTIPLE_TASK with
               NEW_TASK always makes a fresh task, so neither can happen. */
            Uri uri = ApkProvider.uriFor(host, "update.apk").buildUpon()
                .appendQueryParameter("v", String.valueOf(file.lastModified())).build();
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_MULTIPLE_TASK);
            host.installSeen = false;
            String answer = start(intent);
            if (!"ok".equals(answer)) return answer;
            return pauseSeen(4000) ? "ok" : "the installer did not open, tap again";
        }

        /* Waits for the window to pause, which is the installer coming up. */
        private boolean pauseSeen(long ms) {
            long until = System.currentTimeMillis() + ms;
            while (System.currentTimeMillis() < until) {
                if (host.installSeen) return true;
                try {
                    Thread.sleep(40);
                } catch (InterruptedException e) {
                    return host.installSeen;
                }
            }
            return host.installSeen;
        }

        /* Opens an address in the browser of the phone, so a sign in can
           be approved there and the app waits at home. */
        @JavascriptInterface
        public String openUrl(String url) {
            if (url == null) return null;
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            return start(intent);
        }

        /* Opens the explorer of the phone, so a file can be picked. */
        @JavascriptInterface
        public String pick() {
            try {
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.setType("*/*");
                i.addCategory(Intent.CATEGORY_OPENABLE);
                host.startActivityForResult(i, PICK);
                return "picking";
            } catch (Exception e) {
                return "error " + e.getClass().getSimpleName();
            }
        }

        /* The words of the file that was picked. */
        @JavascriptInterface
        public String pickedText() {
            return host.pickedWords();
        }

        /* Writes a character out and offers it to the phone, so it can be
           sent to somebody. */
        @JavascriptInterface
        public String share(String name, String text) {
            try {
                java.io.File file = new java.io.File(host.getFilesDir(), name);
                java.io.FileOutputStream out = new java.io.FileOutputStream(file);
                out.write(text.getBytes("UTF-8"));
                out.close();
                Uri uri = ApkProvider.uriFor(host, name);
                Intent intent = new Intent(Intent.ACTION_SEND);
                intent.setType("application/json");
                intent.putExtra(Intent.EXTRA_STREAM, uri);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser = Intent.createChooser(intent, "Send the character");
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                host.startActivity(chooser);
                return "ok";
            } catch (Exception e) {
                return "error " + e.getClass().getSimpleName();
            }
        }

        /* Offers a piece of text to the phone, so a link can be sent to
           somebody. */
        /* The clipboard, for an invite copied from a message. */
        @JavascriptInterface
        public String clipText() {
            /* The clipboard is read on the thread of the activity: an older
               phone builds its clipboard with a handler of the thread that
               first asks for it. */
            String[] answer = new String[] { "" };
            java.util.concurrent.CountDownLatch done = new java.util.concurrent.CountDownLatch(1);
            host.runOnUiThread(new ClipRead(host, answer, done));
            try {
                done.await(2, java.util.concurrent.TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                return "";
            }
            return answer[0];
        }

        @JavascriptInterface
        public String shareText(String text) {
            try {
                Intent intent = new Intent(Intent.ACTION_SEND);
                intent.setType("text/plain");
                intent.putExtra(Intent.EXTRA_TEXT, text);
                Intent chooser = Intent.createChooser(intent, "Send the link");
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                host.startActivity(chooser);
                return "ok";
            } catch (Exception e) {
                return "error " + e.getClass().getSimpleName();
            }
        }

        /* Asks the repository something, with the token of the player. */
        /* A call to GitHub, in any method, with a token or without one.
           The answer comes back as a small envelope, so the page knows the
           status as well as the body: the sign in answers 200 while it waits,
           and the calls that write answer 201 when a file was made. */
        @JavascriptInterface
        public String request(String url, String method, String body, String token) {
            if (url == null) return null;
            if (!github(url)) return "error not github";
            try {
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                c.setConnectTimeout(5000);
                c.setReadTimeout(20000);
                c.setRequestMethod(method == null ? "GET" : method);
                c.setRequestProperty("Accept", "application/json");
                if (token != null && token.length() > 0) c.setRequestProperty("Authorization", "Bearer " + token);
                if (body != null && body.length() > 0) {
                    c.setDoOutput(true);
                    c.setRequestProperty("Content-Type", "application/json");
                    java.io.OutputStream out = c.getOutputStream();
                    out.write(body.getBytes("UTF-8"));
                    out.close();
                }
                int code = c.getResponseCode();
                java.io.InputStream in = (code >= 200 && code <= 299) ? c.getInputStream() : c.getErrorStream();
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                if (in != null) {
                    byte[] chunk = new byte[8192];
                    int n;
                    while ((n = in.read(chunk)) > 0) out.write(chunk, 0, n);
                    in.close();
                }
                c.disconnect();
                String text = out.toString("UTF-8");
                org.json.JSONObject o = new org.json.JSONObject();
                o.put("status", code);
                o.put("body", text);
                return o.toString();
            } catch (Exception e) {
                return "error " + e.getClass().getSimpleName();
            }
        }

        /* The agent's door: a JSON body posted to the /agent route of the
           machine that serves the app, on the network of the house and
           nowhere else, with no token. The answer is the same envelope a
           request answers with. */
        private static boolean houseAgent(String url) {
            try {
                java.net.URL u = new java.net.URL(url);
                if (!"http".equals(u.getProtocol())) return false;
                if (!"/agent".equals(u.getPath()) && !"/paint".equals(u.getPath())) return false;
                String h = u.getHost();
                if (h.startsWith("192.168.") || h.startsWith("10.")) return true;
                if (h.startsWith("172.")) {
                    String[] p = h.split("\\.");
                    int second = Integer.parseInt(p[1]);
                    return second >= 16 && second <= 31;
                }
                return false;
            } catch (Exception e) {
                return false;
            }
        }

        public String agent(String url, String body) {
            if (url == null || !houseAgent(url)) return "error not the house agent";
            try {
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                c.setConnectTimeout(5000);
                /* A picture is drawn in half a minute and may be slow on a
                   busy machine; the model answers in a few seconds. */
                c.setReadTimeout("/paint".equals(new java.net.URL(url).getPath()) ? 240000 : 120000);
                c.setRequestMethod("POST");
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                java.io.OutputStream o = c.getOutputStream();
                o.write((body == null ? "" : body).getBytes("UTF-8"));
                o.close();
                int code = c.getResponseCode();
                java.io.InputStream in = (code >= 200 && code <= 299) ? c.getInputStream() : c.getErrorStream();
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                if (in != null) {
                    byte[] chunk = new byte[8192];
                    int n;
                    while ((n = in.read(chunk)) > 0) out.write(chunk, 0, n);
                    in.close();
                }
                c.disconnect();
                org.json.JSONObject env = new org.json.JSONObject();
                env.put("status", code);
                env.put("body", out.toString("UTF-8"));
                return env.toString();
            } catch (Exception e) {
                return "error " + e.getClass().getSimpleName();
            }
        }

        @JavascriptInterface
        public String fetchUrl(String url) {
            if (url == null) return null;
            try {
                java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                c.setConnectTimeout(4000);
                c.setReadTimeout(8000);
                c.setRequestMethod("GET");
                int code = c.getResponseCode();
                if (code < 200 || code > 299) {
                    c.disconnect();
                    return "error " + code;
                }
                InputStream in = c.getInputStream();
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] chunk = new byte[8192];
                int n;
                while ((n = in.read(chunk)) > 0) out.write(chunk, 0, n);
                in.close();
                c.disconnect();
                return out.toString("UTF-8");
            } catch (Exception e) {
                return "error " + e.getClass().getSimpleName();
            }
        }
    }

    /* One call of the bridge, run off the thread of the page. */
    private static class Job implements Runnable {

        private final FetchBridge bridge;
        private final String id;
        private final String kind;
        private final String[] args;

        Job(FetchBridge bridge, String id, String kind, String[] args) {
            this.bridge = bridge;
            this.id = id;
            this.kind = kind;
            this.args = args;
        }

        public void run() {
            String result;
            try {
                result = bridge.run(kind, args);
            } catch (Exception e) {
                result = "error " + e.getClass().getSimpleName();
            }
            bridge.done(id, result);
        }
    }

    /* The file control of the page waits here, and the file the player
       picked goes back to it. */
    void awaitFile(ValueCallback<Uri[]> callback) {
        if (filePath != null) filePath.onReceiveValue(null);
        filePath = callback;
    }

    void takeFile(Uri[] value) {
        ValueCallback<Uri[]> callback = filePath;
        filePath = null;
        if (callback != null) callback.onReceiveValue(value);
    }

    /* The chooser of a file control: the page keeps one control and the
       window answers it with the explorer of the phone. */
    private static class ChooserClient extends WebChromeClient {

        private final MainActivity host;

        ChooserClient(MainActivity host) {
            this.host = host;
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            host.runOnUiThread(new CameraAsk(host, request));
        }

        @Override
        public boolean onShowFileChooser(WebView web, ValueCallback<Uri[]> callback, FileChooserParams params) {
            host.awaitFile(callback);
            try {
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.setType("image/*");
                i.addCategory(Intent.CATEGORY_OPENABLE);
                host.startActivityForResult(i, PICK_IMAGE);
                return true;
            } catch (Exception e) {
                host.takeFile(null);
                return false;
            }
        }
    }

    /* Named classes and not anonymous ones, for the d8 of build-tools 34. */
    private static class ClipRead implements Runnable {

        private final MainActivity host;
        private final String[] answer;
        private final java.util.concurrent.CountDownLatch done;

        ClipRead(MainActivity host, String[] answer, java.util.concurrent.CountDownLatch done) {
            this.host = host;
            this.answer = answer;
            this.done = done;
        }

        public void run() {
            try {
                answer[0] = host.clipboardText();
            } finally {
                done.countDown();
            }
        }
    }

    private static class CameraAsk implements Runnable {

        private final MainActivity host;
        private final PermissionRequest request;

        CameraAsk(MainActivity host, PermissionRequest request) {
            this.host = host;
            this.request = request;
        }

        public void run() {
            host.askCamera(request);
        }
    }

    /* Serves the assets from the local origin, and sends a link to the web
       out of the app. */
    private static class ShellClient extends WebViewClient {

        private final MainActivity host;

        ShellClient(MainActivity host) {
            this.host = host;
        }

        private static String mimeOf(String path) {
            if (path.endsWith(".html")) return "text/html";
            if (path.endsWith(".json")) return "application/json";
            if (path.endsWith(".js")) return "text/javascript";
            if (path.endsWith(".css")) return "text/css";
            if (path.endsWith(".svg")) return "image/svg+xml";
            if (path.endsWith(".png")) return "image/png";
            if (path.endsWith(".woff2")) return "font/woff2";
            return "application/octet-stream";
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (uri == null) return null;
            String where = uri.getScheme() + "://" + uri.getHost();
            if (!ORIGIN.startsWith(where)) return null;
            String path = uri.getPath();
            if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
            while (path.startsWith("/")) path = path.substring(1);
            path = path.replace("..", "");
            String flat = path;
            int slash = flat.lastIndexOf('/');
            if (slash >= 0) flat = flat.substring(slash + 1);
            String[] names = path.equals(flat) ? new String[] { path } : new String[] { path, flat };
            for (String candidate : names) {
                try {
                    InputStream in = host.getAssets().open(candidate);
                    return new WebResourceResponse(mimeOf(candidate), "utf-8", in);
                } catch (IOException e) {
                    /* the next name */
                }
            }
            byte[] none = new byte[0];
            return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(none));
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (uri == null) return false;
            if (ORIGIN.startsWith(uri.getScheme() + "://" + uri.getHost())) return false;
            try {
                host.startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception e) {
                return true;
            }
            return true;
        }
    }
}
