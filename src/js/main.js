document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("pre[class*='language-']").forEach((pre) => {
    const code = pre.querySelector("code");
    if (!code) return;
    if (pre.parentElement?.classList.contains("code-block")) return;

    const button = document.createElement("button");
    button.className = "copy-button";
    button.type = "button";
    button.setAttribute("aria-label", "Copy code");
    button.innerHTML = `
      <span class="copy-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </span>
      <span class="copied-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6 9 17l-5-5"></path>
        </svg>
      </span>
    `;

    button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(code.innerText);
      button.classList.add("copied");

      setTimeout(() => {
        button.classList.remove("copied");
      }, 1500);
    });

    const wrapper = document.createElement("div");
    wrapper.className = "code-block";
    pre.parentNode?.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);
    wrapper.appendChild(button);
  });
});
