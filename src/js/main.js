document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("pre[class*='language-']").forEach((pre) => {
    const code = pre.querySelector("code");
    if (!code) return;

    const button = document.createElement("button");
    button.className = "copy-button";
    button.type = "button";
    button.textContent = "copy";

    button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(code.innerText);
      button.textContent = "copied";
      button.classList.add("copied");

      setTimeout(() => {
        button.textContent = "copy";
        button.classList.remove("copied");
      }, 1500);
    });

    pre.appendChild(button);
  });
});
