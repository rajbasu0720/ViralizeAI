document.addEventListener("DOMContentLoaded", () => {
  // Dynamically inject the cursor blob into the page
  const blob = document.createElement("div");
  blob.className = "cursor-blob";
  blob.id = "cursor-blob";
  document.body.appendChild(blob);

  // Track mouse movement with a smooth trailing animation
  document.addEventListener("mousemove", (e) => {
    if (blob.animate) {
      blob.animate({
        left: `${e.clientX}px`,
        top: `${e.clientY}px`
      }, { duration: 4000, fill: "forwards" });
    } else {
      // Fallback for older browsers
      blob.style.left = `${e.clientX}px`;
      blob.style.top = `${e.clientY}px`;
    }
  });
});
