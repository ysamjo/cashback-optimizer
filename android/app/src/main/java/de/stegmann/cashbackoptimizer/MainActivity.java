package de.stegmann.cashbackoptimizer;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.Editable;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.TextWatcher;
import android.text.style.ForegroundColorSpan;
import android.text.style.StyleSpan;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.BaseAdapter;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;

import org.json.JSONArray;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;

public final class MainActivity extends ComponentActivity {
    public static final String ACTION_QUICK_SEARCH = "de.stegmann.cashbackoptimizer.ACTION_QUICK_SEARCH";
    private static final String MAIN_HOST = "cashback-optimizer.de";
    private static final String START_URL = "https://" + MAIN_HOST + "/";
    private static final String PREFS_NAME = "cashback_optimizer_prefs";
    private static final String KEY_CACHED_SHOPS = "cached_shops_json";
    private static final String KEY_RECENT_SHOPS = "recent_shops_json";

    private static final String[] DEFAULT_POPULAR_SHOPS = {
        "About You", "Acer", "Adidas", "AirBnB", "Aldi Reisen", "AliExpress",
        "Amazon", "Apple", "ASOS", "Baby-Walz", "Baur", "Berge & Meer",
        "Billiger-Mietwagen.de", "Booking.com", "Bücher.de", "C&A", "Cyberport",
        "Decathlon", "Deichmann", "Deliveroo", "DocMorris", "Douglas", "eBay",
        "Eis.de", "Europcar", "Eventim", "Expedia", "Flaconi", "FlixBus",
        "Galeria", "G-Star RAW", "H&M", "Hessnatur", "HolidayCheck", "Home24",
        "Hotels.com", "IKEA", "Lieferando.de", "Lidl", "MediaMarkt", "Mister Spex",
        "Mytheresa", "Netto MD", "Nike", "Notebooksbilliger", "Otto", "Peek & Cloppenburg",
        "Puma", "ReiseBank", "Rossmann", "Saturn", "Shop Apotheke", "Sixt",
        "SNIPES", "Steam", "Tchibo", "Thalia", "TUI", "Wayfair", "Zalando"
    };

    private WebView webView;
    private ProgressBar progressBar;
    private String userscript;

    // Schnellsuche UI
    private View searchOverlay;
    private EditText editSearchQuery;
    private ImageButton btnSearchClear;
    private ListView listSearchResults;
    private TextView textSearchEmpty;
    private SearchResultsAdapter searchAdapter;

    private final List<String> allShops = new ArrayList<>();
    private final List<String> filteredShops = new ArrayList<>();
    private final List<String> recentShops = new ArrayList<>();
    private String currentQuery = "";

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        userscript = readAsset("userscript.js");
        loadCachedShops();
        createWebView();

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (searchOverlay != null && searchOverlay.getVisibility() == View.VISIBLE) {
                    closeQuickSearch();
                    return;
                }
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                    return;
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
            }
        });

        if (state != null) {
            webView.restoreState(state);
        } else {
            webView.loadUrl(START_URL);
        }

        handleSearchIntent(getIntent());
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleSearchIntent(intent);
    }

    private void handleSearchIntent(Intent intent) {
        if (intent == null) return;
        if (ACTION_QUICK_SEARCH.equals(intent.getAction())) {
            openQuickSearch();
            return;
        }
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            String shared = extractSharedText(intent);
            if (shared != null && !shared.isEmpty()) {
                handleSharedText(shared);
            }
        }
    }

    /** Liest den über das Share-Sheet geteilten Text (Link oder Freitext) aus. */
    private String extractSharedText(Intent intent) {
        String type = intent.getType();
        if (type != null && !type.startsWith("text/")) return null;
        CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (text == null || text.toString().trim().isEmpty()) {
            text = intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT);
        }
        return text != null ? text.toString().trim() : null;
    }

    /** Sucht einen bekannten Händler im geteilten Text und öffnet dessen Suchseite. */
    private void handleSharedText(String text) {
        String shop = findShopInText(text);
        if (shop != null) {
            selectShop(shop);
            return;
        }
        Toast.makeText(this, R.string.share_no_shop, Toast.LENGTH_SHORT).show();
        openQuickSearchWithQuery(deriveKeyword(text));
    }

    /** Liefert den längsten bekannten Händlernamen, der im Text vorkommt (normalisiert verglichen). */
    private String findShopInText(String text) {
        String normText = normalize(text);
        String best = null;
        int bestLen = 0;
        for (String shop : allShops) {
            String normShop = normalize(shop);
            if (normShop.length() < 3) continue;
            if (normText.contains(normShop) && normShop.length() > bestLen) {
                best = shop;
                bestLen = normShop.length();
            }
        }
        return best;
    }

    /** Leitet aus dem geteilten Text ein Suchstichwort ab (bei URLs die Domain ohne TLD). */
    private String deriveKeyword(String text) {
        java.util.regex.Matcher matcher = android.util.Patterns.WEB_URL.matcher(text);
        if (matcher.find()) {
            Uri uri = Uri.parse(matcher.group());
            String host = uri.getHost();
            if (host != null) {
                String clean = host.toLowerCase().replaceFirst("^www\\.", "");
                String[] parts = clean.split("\\.");
                return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
            }
        }
        String trimmed = text.trim();
        return trimmed.length() > 60 ? trimmed.substring(0, 60) : trimmed;
    }

    private void openQuickSearchWithQuery(String query) {
        openQuickSearch();
        if (query != null && !query.isEmpty()) {
            editSearchQuery.setText(query);
            editSearchQuery.setSelection(query.length());
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void createWebView() {
        FrameLayout root = new FrameLayout(this);

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);

        // Automatischer Dark Mode für die WebView
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            settings.setAlgorithmicDarkeningAllowed(true);
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            settings.setForceDark(WebSettings.FORCE_DARK_AUTO);
        }

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int progress) {
                progressBar.setProgress(progress);
                progressBar.setVisibility(progress < 100 ? View.VISIBLE : View.GONE);
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (isMainSite(request.getUrl())) return false;
                openExternally(request.getUrl());
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                if (isMainSite(Uri.parse(url))) {
                    injectUserscript();
                    extractShopNamesFromPage();
                }
            }
            @Override public void onPageStarted(WebView view, String url, Bitmap favicon) {
                progressBar.setVisibility(View.VISIBLE);
            }
        });

        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        root.addView(progressBar, new FrameLayout.LayoutParams(-1, dp(3)));

        // Floating Schnellsuche Button
        ImageView fabSearch = new ImageView(this);
        fabSearch.setImageResource(R.drawable.ic_search);
        fabSearch.setBackgroundResource(R.drawable.fab_search_bg);
        fabSearch.setContentDescription(getString(R.string.widget_name));
        fabSearch.setElevation(dp(6));
        fabSearch.setPadding(dp(13), dp(13), dp(13), dp(13));
        fabSearch.setOnClickListener(v -> openQuickSearch());

        FrameLayout.LayoutParams fabParams = new FrameLayout.LayoutParams(dp(50), dp(50), Gravity.BOTTOM | Gravity.END);
        fabParams.setMargins(0, 0, dp(18), dp(18));
        root.addView(fabSearch, fabParams);

        // Schnellsuche Overlay
        setupSearchOverlay(root);

        // System Insets
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                int topInset = insets.getInsets(WindowInsets.Type.statusBars()).top;
                int bottomInset = insets.getInsets(WindowInsets.Type.navigationBars()).bottom;
                int leftInset = insets.getInsets(WindowInsets.Type.displayCutout()).left;
                int rightInset = insets.getInsets(WindowInsets.Type.displayCutout()).right;
                view.setPadding(leftInset, topInset, rightInset, bottomInset);
                return WindowInsets.CONSUMED;
            });
        }

        setContentView(root);
    }

    private void setupSearchOverlay(FrameLayout root) {
        searchOverlay = LayoutInflater.from(this).inflate(R.layout.search_overlay, root, false);
        editSearchQuery = searchOverlay.findViewById(R.id.edit_search_query);
        btnSearchClear = searchOverlay.findViewById(R.id.btn_search_clear);
        listSearchResults = searchOverlay.findViewById(R.id.list_search_results);
        textSearchEmpty = searchOverlay.findViewById(R.id.text_search_empty);

        searchAdapter = new SearchResultsAdapter();
        listSearchResults.setAdapter(searchAdapter);

        searchOverlay.findViewById(R.id.btn_search_back).setOnClickListener(v -> closeQuickSearch());
        searchOverlay.setOnClickListener(v -> closeQuickSearch());

        btnSearchClear.setOnClickListener(v -> {
            editSearchQuery.setText("");
            filterShops("");
        });

        editSearchQuery.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                String query = s.toString();
                btnSearchClear.setVisibility(query.isEmpty() ? View.GONE : View.VISIBLE);
                filterShops(query);
            }
            @Override public void afterTextChanged(Editable s) {}
        });

        editSearchQuery.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                if (!filteredShops.isEmpty()) {
                    selectShop(filteredShops.get(0));
                } else {
                    String query = editSearchQuery.getText().toString().trim();
                    if (!query.isEmpty()) selectShop(query);
                }
                return true;
            }
            return false;
        });

        listSearchResults.setOnItemClickListener((parent, view, position, id) -> {
            if (position >= 0 && position < filteredShops.size()) {
                selectShop(filteredShops.get(position));
            }
        });

        root.addView(searchOverlay, new FrameLayout.LayoutParams(-1, -1));
    }

    public void openQuickSearch() {
        if (searchOverlay == null) return;
        searchOverlay.setVisibility(View.VISIBLE);
        filterShops(editSearchQuery.getText().toString());
        editSearchQuery.requestFocus();

        editSearchQuery.postDelayed(() -> {
            InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) imm.showSoftInput(editSearchQuery, InputMethodManager.SHOW_IMPLICIT);
        }, 120);
    }

    public void closeQuickSearch() {
        if (searchOverlay == null || searchOverlay.getVisibility() != View.VISIBLE) return;
        InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null) imm.hideSoftInputFromWindow(editSearchQuery.getWindowToken(), 0);
        searchOverlay.setVisibility(View.GONE);
    }

    private void saveRecentShop(String shopName) {
        if (shopName == null || shopName.trim().isEmpty()) return;
        String clean = shopName.trim();
        recentShops.remove(clean);
        recentShops.add(0, clean);
        while (recentShops.size() > 5) {
            recentShops.remove(recentShops.size() - 1);
        }
        try {
            getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit()
                .putString(KEY_RECENT_SHOPS, new JSONArray(recentShops).toString())
                .apply();
        } catch (Exception ignored) {}
    }

    private void selectShop(String shopName) {
        saveRecentShop(shopName);
        closeQuickSearch();
        try {
            String filterUrl = "https://" + MAIN_HOST + "/?filter=" + URLEncoder.encode(shopName, "UTF-8");
            webView.loadUrl(filterUrl);
        } catch (Exception e) {
            webView.loadUrl(START_URL);
        }
    }

    private static String normalize(String s) {
        if (s == null) return "";
        return s.toLowerCase()
                .replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
                .replaceAll("[^a-z0-9]", "");
    }

    private void filterShops(String query) {
        currentQuery = query != null ? query.trim() : "";
        filteredShops.clear();
        String qNorm = normalize(currentQuery);

        if (qNorm.isEmpty()) {
            // 1. Zuletzt gesuchte Shops (Chronik)
            for (String recent : recentShops) {
                if (!filteredShops.contains(recent)) {
                    filteredShops.add(recent);
                }
            }
            // 2. Beliebte Shops auffüllen
            for (String shop : allShops) {
                if (!filteredShops.contains(shop)) {
                    filteredShops.add(shop);
                }
                if (filteredShops.size() >= 25) break;
            }
        } else {
            List<String> starts = new ArrayList<>();
            List<String> contains = new ArrayList<>();
            for (String shop : allShops) {
                String sNorm = normalize(shop);
                if (sNorm.startsWith(qNorm)) {
                    starts.add(shop);
                } else if (sNorm.contains(qNorm)) {
                    contains.add(shop);
                }
                if (starts.size() + contains.size() >= 25) break;
            }
            filteredShops.addAll(starts);
            filteredShops.addAll(contains);
        }

        searchAdapter.notifyDataSetChanged();
        textSearchEmpty.setVisibility(filteredShops.isEmpty() ? View.VISIBLE : View.GONE);
        listSearchResults.setVisibility(filteredShops.isEmpty() ? View.GONE : View.VISIBLE);
    }

    private void loadCachedShops() {
        allShops.clear();
        recentShops.clear();
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);

        String recentJson = prefs.getString(KEY_RECENT_SHOPS, null);
        if (recentJson != null) {
            try {
                JSONArray rArr = new JSONArray(recentJson);
                for (int i = 0; i < rArr.length(); i++) {
                    String name = rArr.optString(i);
                    if (!name.isEmpty() && !recentShops.contains(name)) recentShops.add(name);
                }
            } catch (Exception ignored) {}
        }

        String json = prefs.getString(KEY_CACHED_SHOPS, null);
        if (json != null) {
            try {
                JSONArray arr = new JSONArray(json);
                for (int i = 0; i < arr.length(); i++) {
                    String name = arr.optString(i);
                    if (!name.isEmpty()) allShops.add(name);
                }
            } catch (Exception ignored) {}
        }

        if (allShops.isEmpty()) {
            allShops.addAll(Arrays.asList(DEFAULT_POPULAR_SHOPS));
        }
    }

    private void extractShopNamesFromPage() {
        webView.evaluateJavascript(
            "(function() { " +
            "  try { " +
            "    var nodes = document.querySelectorAll('.shop-area-header.filter-tag'); " +
            "    var names = []; " +
            "    for (var i = 0; i < nodes.length; i++) { " +
            "      var t = nodes[i].textContent.trim(); " +
            "      if (t) names.push(t); " +
            "    } " +
            "    return JSON.stringify(names); " +
            "  } catch(e) { return '[]'; } " +
            "})()",
            value -> {
                if (value == null || value.length() <= 4 || "null".equals(value)) return;
                try {
                    // JSON-String parsen (value ist ein JSON-String eines JSON-Arrays)
                    String raw = value.startsWith("\"") && value.endsWith("\"")
                            ? new org.json.JSONTokener(value).nextValue().toString()
                            : value;
                    JSONArray arr = new JSONArray(raw);
                    if (arr.length() > 0) {
                        LinkedHashSet<String> set = new LinkedHashSet<>();
                        for (int i = 0; i < arr.length(); i++) {
                            String name = arr.optString(i);
                            if (!name.isEmpty()) set.add(name);
                        }
                        allShops.clear();
                        allShops.addAll(set);

                        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                            .edit()
                            .putString(KEY_CACHED_SHOPS, new JSONArray(allShops).toString())
                            .apply();
                    }
                } catch (Exception ignored) {}
            }
        );
    }

    private final class SearchResultsAdapter extends BaseAdapter {
        @Override public int getCount() { return filteredShops.size(); }
        @Override public Object getItem(int position) { return filteredShops.get(position); }
        @Override public long getItemId(int position) { return position; }
        @Override public View getView(int position, View convertView, ViewGroup parent) {
            View view = convertView != null ? convertView : LayoutInflater.from(parent.getContext()).inflate(R.layout.item_search_result, parent, false);
            TextView nameView = view.findViewById(R.id.text_shop_name);
            TextView badgeView = view.findViewById(R.id.text_shop_badge);
            String shopName = filteredShops.get(position);

            boolean isRecent = currentQuery.isEmpty() && recentShops.contains(shopName);
            if (isRecent) {
                nameView.setText("🕒 " + shopName);
                if (badgeView != null) {
                    badgeView.setText(getString(R.string.recent_search_badge));
                    badgeView.setTextColor(Color.parseColor("#B5964C"));
                }
            } else {
                if (!currentQuery.isEmpty()) {
                    String shopLower = shopName.toLowerCase();
                    String queryLower = currentQuery.toLowerCase();
                    int matchIdx = shopLower.indexOf(queryLower);
                    if (matchIdx >= 0) {
                        SpannableString spannable = new SpannableString(shopName);
                        spannable.setSpan(new ForegroundColorSpan(Color.parseColor("#B5964C")),
                                matchIdx, matchIdx + currentQuery.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                        spannable.setSpan(new StyleSpan(Typeface.BOLD),
                                matchIdx, matchIdx + currentQuery.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                        nameView.setText(spannable);
                    } else {
                        nameView.setText(shopName);
                    }
                } else {
                    nameView.setText(shopName);
                }
                if (badgeView != null) {
                    badgeView.setText("Cashback →");
                    badgeView.setTextColor(Color.parseColor("#997C2E"));
                }
            }
            return view;
        }
    }

    /** Lädt das Userscript (GM_*-APIs fehlen im WebView – das Script fällt selbst auf localStorage/fetch zurück). */
    private void injectUserscript() {
        if (userscript == null || userscript.isEmpty()) return;
        webView.evaluateJavascript(userscript, null);
    }

    private boolean isMainSite(Uri uri) {
        String host = uri.getHost();
        return host != null && (host.equals(MAIN_HOST) || host.endsWith("." + MAIN_HOST));
    }

    private void openExternally(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.no_browser, Toast.LENGTH_SHORT).show();
        }
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private String readAsset(String name) {
        try (InputStream in = getAssets().open(name);
             BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line).append('\n');
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }

    @Override protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        webView.saveState(state);
    }

    @Override protected void onDestroy() {
        if (webView != null) {
            ViewGroup parent = (ViewGroup) webView.getParent();
            if (parent != null) parent.removeView(webView);
            webView.destroy();
        }
        super.onDestroy();
    }
}
