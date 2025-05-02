/**
 * Proxy Authentication Extension
 * @author imhiendev
 * @version 1.0
 * @description Extension tự động thiết lập proxy và xác thực từ tham số URL
 * @copyright 2025 imhiendev
 */

let proxyAuthListener = null;

// Lấy proxy từ URL của tab hiện tại
function getProxyFromURL() {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            try {
                if (!tabs || !tabs[0] || !tabs[0].url) {
                    console.log("No active tab or URL found");
                    resolve(null);
                    return;
                }
                const url = new URL(tabs[0].url);
                const proxyParam = url.searchParams.get("proxy");
                console.log("Extracted proxy param:", proxyParam);
                resolve(proxyParam);
            } catch (e) {
                console.error("Error parsing URL:", e);
                resolve(null);
            }
        });
    });
}

// Thiết lập proxy
function setProxy(proxyString) {
    if (!proxyString || !proxyString.includes(":")) {
        console.log("Invalid proxy string:", proxyString);
        return;
    }

    // Đảm bảo xóa proxy cũ trước khi thiết lập proxy mới
    disableProxy().then(() => {
        const [host, port, username, password] = proxyString.split(":");
        const config = {
            mode: "fixed_servers",
            rules: {
                singleProxy: {
                    scheme: "http",
                    host: host,
                    port: parseInt(port),
                },
                bypassList: ["localhost"],
            },
        };

        chrome.proxy.settings.set({ value: config, scope: "regular" }, () => {
            if (chrome.runtime.lastError) {
                console.error("Error setting proxy:", chrome.runtime.lastError);
            } else {
                console.log("Proxy set successfully:", config);
            }
        });

        // Gán listener vào biến để có thể gỡ sau này
        proxyAuthListener = (details) => {
            console.log("Providing auth credentials for proxy");
            return {
                authCredentials: {
                    username: username,
                    password: password,
                },
            };
        };

        // Đảm bảo không có listener cũ trước khi thêm listener mới
        try {
            chrome.webRequest.onAuthRequired.removeListener(proxyAuthListener);
        } catch (err) {
            // Bỏ qua lỗi nếu không có listener
        }

        chrome.webRequest.onAuthRequired.addListener(
            proxyAuthListener,
            { urls: ["<all_urls>"] },
            ["blocking"]
        );
    });
}

// Tắt proxy và gỡ listener xác thực
async function disableProxy() {
    return new Promise((resolve) => {
        // Thiết lập rõ ràng chế độ direct thay vì chỉ clear
        const config = {
            mode: "direct"
        };
        
        chrome.proxy.settings.set({ value: config, scope: "regular" }, () => {
            if (chrome.runtime.lastError) {
                console.error("Error setting direct mode:", chrome.runtime.lastError);
            } else {
                console.log("Proxy set to direct mode successfully");
            }
            
            // Đảm bảo remove listener
            if (proxyAuthListener) {
                try {
                    chrome.webRequest.onAuthRequired.removeListener(proxyAuthListener);
                    console.log("Removed proxy auth listener");
                } catch (err) {
                    console.error("Failed to remove auth listener:", err);
                }
                proxyAuthListener = null;
            }
            
            // Kiểm tra lại cài đặt proxy để đảm bảo đã được thiết lập đúng
            chrome.proxy.settings.get({}, (settings) => {
                console.log("Current proxy settings:", settings);
                resolve();
            });
        });
    });
}

// Hàm khởi tạo proxy
async function initializeProxy() {
    const proxyString = await getProxyFromURL();
    const url = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!url || !url[0] || !url[0].url) {
        console.log("No active tab or URL found");
        return;
    }
    
    const currentTabURL = url[0].url;
    console.log("Current tab URL:", currentTabURL);

    // Kiểm tra nếu URL là about:blank và có tham số proxy=off
    if (proxyString === "off") {
        console.log("Proxy disabled via URL parameter");
        await disableProxy();
    } else if (proxyString) {
        console.log("Initializing proxy with string:", proxyString);
        setProxy(proxyString);
    } else {
        console.log("No proxy string found in URL");
        // Không làm gì nếu không có tham số proxy
    }
}

// Khi Chrome khởi động
chrome.runtime.onStartup.addListener(() => {
    console.log("Extension started on Chrome startup");
    // Đảm bảo proxy được tắt khi khởi động
    disableProxy().then(() => {
        initializeProxy();
    });
});

// Khi extension được cài đặt hoặc cập nhật
chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed or updated");
    // Đảm bảo proxy được tắt khi cài đặt
    disableProxy().then(() => {
        initializeProxy();
    });
});

// Khi tab được cập nhật (để giữ service worker hoạt động và kiểm tra proxy)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.active) {
        console.log("Tab updated, checking for proxy in URL");
        initializeProxy();
    }
});

// Log khi service worker khởi động
console.log("Service worker initialized");
// Đảm bảo proxy được tắt khi service worker khởi động
disableProxy();
