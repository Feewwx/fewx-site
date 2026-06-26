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
async function renderList(sectionName, containerId) {
    const manifest = await fetchManifest();
    const posts = manifest.filter(post => post.section === sectionName);
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
        
        const markdownText = await response.json ? await response.text() : await response.text();
        
        // 使用 marked 将 Markdown 源码转换成 HTML
        document.getElementById('article-content').innerHTML = window.marked.parse(markdownText);
    } catch (error) {
        console.error(error);
        document.getElementById('article-content').innerHTML = `<p style="color:red;">无法加载文章正文内容 (${error.message})</p>`;
    }
}
