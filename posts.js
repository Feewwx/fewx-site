// posts.js

// 1. 公用：获取文章索引
async function fetchManifest() {
    try {
        const response = await fetch('./posts/manifest.json');
        return await response.json();
    } catch (error) {
        console.error("Failed to load manifest.json:", error);
        return [];
    }
}

// 2. 列表页渲染逻辑 (用于 index.html, products.html, log.html)

// 排序键：同一天的文章，再去文件名里把时分抠出来分先后。
//
// 为什么需要这个：manifest 里的 date 只精确到天（"2026-09-13"），同一天的所有文章
// 比较结果全是 0，排序就退化成"看它们在数组里谁先谁后"——那是运气，不是顺序。
// 而时间其实一直在文件名里（C_26-09-13-10-00PM），只是排序没读它。
//
// 文件名末尾匹配 -HH-MMAM / -HH-MMPM，抠出来换算成分钟加到当天的零点上。
// 匹配不上的（比如 HOME 的 home-26-09-13 没有时分）就只用日期，行为跟以前一样。
function sortKey(post) {
    const base = new Date(post.date).getTime() || 0;
    const m = String(post.id).match(/-(\d{2})-(\d{2})(AM|PM)$/);
    if (!m) return base;
    let hour = parseInt(m[1], 10) % 12;      // 12AM→0, 12PM→12 靠这两步修
    if (m[3] === 'PM') hour += 12;
    return base + (hour * 60 + parseInt(m[2], 10)) * 60000;
}

async function renderList(sectionName, containerId) {
    const manifest = await fetchManifest();
    const posts = manifest.filter(post => post.section === sectionName);
    posts.sort((a, b) => sortKey(b) - sortKey(a));
    const container = document.getElementById(containerId);
    
    if (!container) return;

    if (posts.length === 0) {
        container.innerHTML = "<p style='color:#666;'>No signals detected yet...</p>";
        return;
    }

    let html = '';
    posts.forEach(post => {
        html += `
            <div class="post-card">
                <h3><a href="post.html?id=${post.id}">${post.title}</a></h3>
                <div class="meta">${post.date}</div>
                <p>${post.summary}</p>
                <a href="post.html?id=${post.id}" class="read-more">READ MORE →</a>
            </div>
        `;
    });
    container.innerHTML = html;
}

// 3. 详情页渲染逻辑 (用于 post.html)
async function renderSinglePost() {
    const { marked } = await import("https://cdn.jsdelivr.net/npm/marked@12.0.1/lib/marked.esm.js");
    // 从 URL 中获取文章 ID (例如: post.html?id=home-001)
    const urlParams = new URLSearchParams(window.location.search);
    const postId = urlParams.get('id');
    
    if (!postId) {
        document.getElementById('article-title').innerText = "Post Not Found";
        return;
    }

    // 获取元数据以拿到标题和日期
    const manifest = await fetchManifest();
    const postMeta = manifest.find(post => post.id === postId);

    if (!postMeta) {
        document.getElementById('article-title').innerText = "Article metadata missing";
        return;
    }

    // 填入标题和时间
    document.getElementById('article-title').innerText = postMeta.title;
    document.getElementById('article-meta').innerText = `PUBLISHED AT: ${postMeta.date} | SECTION: ${postMeta.section}`;

    try {
        // 请求真实的 Markdown 文件
        const response = await fetch(`./posts/${postId}.md`);
        if (!response.ok) throw new Error("Markdown file not found");

        const markdownText = await response.text();

        // 使用本函数顶部动态 import 进来的 marked（而不是 window.marked）。
        // window.marked 是靠每个页面 <head> 里的一段 <script type="module"> 设置的，
        // 但路由切换时只替换 .content-wrapper 和 nav，<head> 里的脚本永远不会重新执行——
        // 如果用户是从一个没有这段 head 脚本的页面（比如 index.html）一路点过来的，
        // window.marked 全程都是 undefined，文章正文就会一直报"无法加载"。
        document.getElementById('article-content').innerHTML = marked.parse(markdownText);
    } catch (error) {
        console.error(error);
        document.getElementById('article-content').innerHTML = `<p style="color:red;">无法加载文章正文内容 (${error.message})</p>`;
    }
}
