document.addEventListener("DOMContentLoaded", () => {
  const themeToggle = document.getElementById("theme-toggle");
  const themeIcon = themeToggle?.querySelector(".theme-toggle-icon");
  const root = document.documentElement;
  const themeStates = ["dark", "light"];
  const themeIcons = {
    dark: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.6 13.2A8.6 8.6 0 1 1 10.8 3.4a7 7 0 0 0 9.8 9.8Z"/></svg>`,
    light: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>`,
  };

  const getCurrentThemeState = () => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };

  const applyThemeState = (state, persist = true) => {
    root.setAttribute("data-theme", state);
    if (persist) {
      localStorage.setItem("theme", state);
    }
    if (themeIcon) themeIcon.innerHTML = themeIcons[state];
    themeToggle?.setAttribute("data-theme-state", state);
    themeToggle?.setAttribute("title", `Theme: ${state}`);
    themeToggle?.setAttribute("aria-label", `Theme: ${state}`);
  };

  if (themeToggle) {
    applyThemeState(getCurrentThemeState(), false);

    themeToggle.addEventListener("click", () => {
      const current = getCurrentThemeState();
      const next = themeStates[(themeStates.indexOf(current) + 1) % themeStates.length];
      applyThemeState(next);
    });
  }

  const burger = document.querySelector(".burger");
  const burgerToggle = document.getElementById("burger-toggle");
  const burgerMenu = document.getElementById("burger-menu");

  const setBurgerState = (open) => {
    if (!burger || !burgerToggle || !burgerMenu) return;
    burger.classList.toggle("open", open);
    burgerToggle.setAttribute("aria-expanded", open ? "true" : "false");
    burgerMenu.setAttribute("aria-hidden", open ? "false" : "true");
  };

  if (burger && burgerToggle && burgerMenu) {
    burgerToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = burger.classList.contains("open");
      setBurgerState(!isOpen);
    });

    burgerMenu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => setBurgerState(false));
    });

    document.addEventListener("click", (event) => {
      if (!burger.contains(event.target)) {
        setBurgerState(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setBurgerState(false);
      }
    });
  }

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
