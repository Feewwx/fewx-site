document.addEventListener("DOMContentLoaded", () => {
  const initContent = () => {
    const wrapper = document.querySelector(".content-wrapper");
    if(wrapper) wrapper.classList.add("animate-in");
    if (document.getElementById("home-stream-container") && typeof renderList === "function") renderList("HOME", "home-stream-container");
    if (document.getElementById("log-stream-container") && typeof renderList === "function") renderList("LOG", "log-stream-container");
    if (document.getElementById("products-stream-container") && typeof renderList === "function") renderList("PRODUCTS", "products-stream-container");
    if (document.getElementById("article-content") && typeof renderSinglePost === "function") renderSinglePost();
  };
  initContent();

  document.body.addEventListener("click", async (e) => {
    let url = null;
    const returnZone = e.target.closest("#top-return-zone");
    const link = e.target.closest("a");

    if (returnZone) {
      url = "index.html"; // 🚀 修复点1：点击顶部不再硬跳转，统一交给路由器处理
    } else if (link) {
      url = link.getAttribute("href");
      if (!url || url.startsWith("http") || url.startsWith("javascript") || link.target === "_blank") return;
    } else {
      return;
    }

    e.preventDefault();
    const currentPath = window.location.pathname.split("/").pop() || "index.html";
    if (url === currentPath) return;

    const currentWrapper = document.querySelector(".content-wrapper");
    if (currentWrapper) {
      currentWrapper.classList.remove("animate-in");
      currentWrapper.classList.add("animate-out");
    }

    try {
      const response = await fetch(url);
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      if (currentWrapper) await new Promise(r => setTimeout(r, 500));

      const newWrapper = doc.querySelector(".content-wrapper");
      // 🚀 修复点2：智能处理主页(无wrapper)与子页(有wrapper)的进出状态
      if (currentWrapper && newWrapper) {
        currentWrapper.replaceWith(newWrapper); // 子页切子页
      } else if (currentWrapper && !newWrapper) {
        currentWrapper.remove(); // 子页回主页
      } else if (!currentWrapper && newWrapper) {
        document.body.appendChild(newWrapper); // 主页进子页
      }

      const newNav = doc.querySelector("nav");
      const currentNav = document.querySelector("nav");
      if (newNav && currentNav) currentNav.innerHTML = newNav.innerHTML;

      document.title = doc.title;
      history.pushState({}, "", url);
      initContent();
    } catch (err) {
      console.error("无缝路由失败:", err);
      window.location.href = url;
    }
  });
  window.addEventListener("popstate", () => { window.location.reload(); });
});
