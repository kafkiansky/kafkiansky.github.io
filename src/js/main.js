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

    const raw = code.textContent ?? "";
    const normalized = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
    const lineCount = Math.max(1, normalized.split("\n").length);
    const lineNumbers = document.createElement("span");
    lineNumbers.className = "code-line-numbers";
    lineNumbers.setAttribute("aria-hidden", "true");
    lineNumbers.textContent = Array.from({ length: lineCount }, (_, index) =>
      String(index + 1)
    ).join("\n");

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
    wrapper.appendChild(lineNumbers);
    wrapper.appendChild(button);
  });

  const lightbox = document.createElement("div");
  lightbox.className = "image-lightbox";
  lightbox.setAttribute("aria-hidden", "true");
  lightbox.innerHTML = `
    <div class="image-lightbox-backdrop"></div>
    <figure class="image-lightbox-figure" role="dialog" aria-modal="true" aria-label="Image preview">
      <button class="image-lightbox-close" type="button" aria-label="Close image">×</button>
      <img class="image-lightbox-image" alt="">
    </figure>
  `;
  document.body.appendChild(lightbox);

  const lightboxImage = lightbox.querySelector(".image-lightbox-image");
  const closeButton = lightbox.querySelector(".image-lightbox-close");
  const backdrop = lightbox.querySelector(".image-lightbox-backdrop");
  const figure = lightbox.querySelector(".image-lightbox-figure");
  let zoomScale = 1;

  const applyZoom = () => {
    if (!lightboxImage) return;
    lightboxImage.style.transform = `scale(${zoomScale})`;
  };

  const closeLightbox = () => {
    lightbox.classList.remove("open");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.classList.remove("lightbox-open");
    zoomScale = 1;
    applyZoom();
    if (lightboxImage) {
      lightboxImage.removeAttribute("src");
      lightboxImage.removeAttribute("srcset");
      lightboxImage.removeAttribute("sizes");
      lightboxImage.alt = "";
    }
  };

  document.querySelectorAll(".post-body img, .post-content img").forEach((img) => {
    img.classList.add("zoomable-image");
    img.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!lightboxImage) return;

      lightboxImage.src = img.currentSrc || img.src;
      lightboxImage.srcset = img.srcset || "";
      lightboxImage.sizes = img.sizes || "";
      lightboxImage.alt = img.alt || "";
      zoomScale = 1;
      applyZoom();

      lightbox.classList.add("open");
      lightbox.setAttribute("aria-hidden", "false");
      document.body.classList.add("lightbox-open");
    });
  });

  closeButton?.addEventListener("click", closeLightbox);
  backdrop?.addEventListener("click", closeLightbox);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && lightbox.classList.contains("open")) {
      closeLightbox();
    }
  });

  figure?.addEventListener(
    "wheel",
    (event) => {
      if (!lightbox.classList.contains("open")) return;
      event.preventDefault();

      const delta = event.deltaY;
      const nextScale = delta < 0 ? zoomScale + 0.12 : zoomScale - 0.12;
      zoomScale = Math.min(4, Math.max(1, Number(nextScale.toFixed(2))));
      applyZoom();
    },
    { passive: false },
  );
});
