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
    // 🌟 修复：单独拦截顶部返回区域的点击 🌟
    const returnZone = e.target.closest("#top-return-zone");
    if (returnZone) {
      const currentWrapper = document.querySelector(".content-wrapper");
      if (currentWrapper) {
        currentWrapper.classList.remove("animate-in");
        currentWrapper.classList.add("animate-out");
      }
      // 动画结束后，跳回无 UI 的 3D 终端主页
      setTimeout(() => { window.location.href = "index.html"; }, 500);
      return;
    }

    const link = e.target.closest("a");
    if (!link) return;
    const url = link.getAttribute("href");
    if (!url || url.startsWith("http") || url.startsWith("javascript") || link.target === "_blank") return;
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
      await new Promise(r => setTimeout(r, 500));
      const newWrapper = doc.querySelector(".content-wrapper");
      if (currentWrapper && newWrapper) currentWrapper.replaceWith(newWrapper);
      const newNav = doc.querySelector("nav");
      if (newNav) document.querySelector("nav").innerHTML = newNav.innerHTML;
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
