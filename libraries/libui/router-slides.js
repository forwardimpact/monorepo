/**
 * Slide Router
 *
 * Extended router with navigation state and keyboard controls for slides.
 */

import { createRouter } from "./router-core.js";

/**
 * @typedef {Object} SlideRouter
 * @property {(pattern: string, handler: Function) => void} on - Register route
 * @property {(path: string) => void} navigate - Navigate to path
 * @property {() => string} currentPath - Get current hash path
 * @property {() => void} handleRoute - Process current route
 * @property {() => void} start - Begin listening for hash changes
 * @property {() => void} stop - Stop listening for hash changes
 * @property {() => string[]} patterns - Get registered patterns
 * @property {(paths: string[]) => void} setSlideOrder - Define navigation order
 * @property {() => void} next - Navigate to next slide
 * @property {() => void} prev - Navigate to previous slide
 * @property {() => void} home - Navigate to index
 * @property {() => number} currentIndex - Current position in order
 * @property {() => number} totalSlides - Total slide count
 * @property {() => void} startKeyboardNav - Enable keyboard shortcuts
 * @property {() => void} stopKeyboardNav - Disable keyboard shortcuts
 */

/**
 * Create a slide router with navigation capabilities
 * @param {{ onNotFound?: (path: string) => void, renderError?: (title: string, message: string) => void }} options
 * @returns {SlideRouter}
 */
export function createSlideRouter(options = {}) {
  const router = createRouter(options);
  let slideOrder = [];
  let chapterBoundaries = [];
  let keyHandler = null;

  /**
   * Find current position in slide order
   * @returns {number}
   */
  function findCurrentIndex() {
    const path = router.currentPath();
    return slideOrder.indexOf(path);
  }

  /**
   * Navigate to slide at given index
   * @param {number} index
   */
  function navigateToIndex(index) {
    if (index >= 0 && index < slideOrder.length) {
      router.navigate(slideOrder[index]);
    }
  }

  const slideRouter = {
    // Expose core router methods
    on: router.on,
    navigate: router.navigate,
    currentPath: router.currentPath,
    handleRoute: router.handleRoute,
    start: router.start,
    stop: router.stop,
    patterns: router.patterns,

    /**
     * Define the slide navigation order
     * @param {string[]} paths
     * @param {number[]} boundaries - Indices where chapters start
     */
    setSlideOrder(paths, boundaries = []) {
      slideOrder = paths;
      chapterBoundaries = boundaries;
    },

    /**
     * Navigate to next slide
     */
    next() {
      const idx = findCurrentIndex();
      navigateToIndex(idx + 1);
    },

    /**
     * Navigate to previous slide
     */
    prev() {
      const idx = findCurrentIndex();
      navigateToIndex(idx - 1);
    },

    /**
     * Navigate to previous chapter
     */
    prevChapter() {
      const idx = findCurrentIndex();
      // Find the previous chapter boundary before current position
      const prevBoundary = chapterBoundaries.filter((b) => b < idx).pop();
      if (prevBoundary !== undefined) {
        navigateToIndex(prevBoundary);
      } else if (idx > 0) {
        navigateToIndex(0);
      }
    },

    /**
     * Navigate to next chapter
     */
    nextChapter() {
      const idx = findCurrentIndex();
      // Find the next chapter boundary after current position
      const nextBoundary = chapterBoundaries.find((b) => b > idx);
      if (nextBoundary !== undefined) {
        navigateToIndex(nextBoundary);
      }
    },

    /**
     * Navigate to first slide (index)
     */
    home() {
      navigateToIndex(0);
    },

    /**
     * Get current slide index
     * @returns {number}
     */
    currentIndex() {
      return findCurrentIndex();
    },

    /**
     * Get total number of slides
     * @returns {number}
     */
    totalSlides() {
      return slideOrder.length;
    },

    /**
     * Start keyboard navigation
     */
    startKeyboardNav() {
      keyHandler = (e) => {
        // Ignore if typing in an input
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
          return;
        }

        switch (e.key) {
          case "ArrowRight":
          case " ":
          case "PageDown":
            e.preventDefault();
            slideRouter.next();
            break;
          case "ArrowLeft":
          case "PageUp":
            e.preventDefault();
            slideRouter.prev();
            break;
          case "ArrowDown":
            e.preventDefault();
            slideRouter.nextChapter();
            break;
          case "ArrowUp":
            e.preventDefault();
            slideRouter.prevChapter();
            break;
          case "Home":
            e.preventDefault();
            slideRouter.home();
            break;
          case "End":
            e.preventDefault();
            navigateToIndex(slideOrder.length - 1);
            break;
          case "Escape":
            e.preventDefault();
            slideRouter.home();
            break;
        }
      };
      document.addEventListener("keydown", keyHandler);
    },

    /**
     * Stop keyboard navigation
     */
    stopKeyboardNav() {
      if (keyHandler) {
        document.removeEventListener("keydown", keyHandler);
        keyHandler = null;
      }
    },
  };

  return slideRouter;
}
