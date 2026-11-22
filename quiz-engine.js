/*!
 * MATCUB — Unified Interactive Quiz Engine 4.4
 * ------------------------------------------------------------
 * Standalone browser-side quiz engine. No dependencies.
 *
 * Supported question types:
 *   single_select  — one correct option; instant evaluation
 *   true_false     — true/false; instant evaluation
 *   multi_select   — multiple correct options; evaluate on submit
 *   matching       — pair terms and definitions; instant when complete
 *   fill_select    — select-based blanks; instant when complete
 *   short_answer   — one typed answer; evaluate on submit / Enter
 *   ordering       — reorder a list; evaluate on submit
 *   categorization — assign items to categories; instant when complete
 *   fill_text      — one or more typed blanks; evaluate on submit
 *
 * Usage:
 *   <script src="quiz-engine.js" defer></script>
 *
 * Required root:
 *   <section class="quiz-container" data-quiz>
 *
 * The visual layer belongs to style.css. This file only manages behavior.
 */
(() => {
  "use strict";

  const VERSION = "4.4.0";
  const ROOT_SELECTOR = ".quiz-container[data-quiz]";
  const ITEM_SELECTOR = ".quiz-item[data-type]";
  const initialized = new WeakSet();
  const initialSnapshots = new WeakMap();

  const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
  const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

  function normalizeText(value) {
    return String(value ?? "")
      .normalize("NFKC")
      .toLocaleLowerCase("fa")
      .replace(/[يى]/g, "ی")
      .replace(/[ك]/g, "ک")
      .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
      .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
      .replace(/\u00A0/g, " ")
      .replace(/[٠-٩]/g, d => PERSIAN_DIGITS[ARABIC_DIGITS.indexOf(d)])
      .replace(/[۰-۹]/g, d => d)
      .replace(/[.,،؛:!?؟()[\]{}"'«»“”‘’]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function splitAliases(value) {
    return String(value ?? "")
      .split("|")
      .map(normalizeText)
      .filter(Boolean);
  }

  function splitTokens(value) {
    return String(value ?? "")
      .split(",")
      .map(part => part.trim())
      .filter(Boolean);
  }

  function normalizeType(value) {
    const type = String(value || "").trim().toLowerCase();
    const aliases = {
      single: "single_select",
      mcq: "single_select",
      multiple_choice: "single_select",
      boolean: "true_false",
      truefalse: "true_false",
      multi: "multi_select",
      multiple_select: "multi_select",
      match: "matching",
      matching_pairs: "matching",
      blank_select: "fill_select",
      fill_blank_select: "fill_select",
      text: "short_answer",
      short: "short_answer",
      sequence: "ordering",
      sort: "ordering",
      order: "ordering",
      category: "categorization",
      classify: "categorization",
      fill_in: "fill_text",
      typed_blanks: "fill_text"
    };
    return aliases[type] || type;
  }

  function getItems(root) {
    return Array.from(root.querySelectorAll(ITEM_SELECTOR))
      .filter(item => item.closest(ROOT_SELECTOR) === root);
  }

  function getFeedbackNode(item) {
    return item.querySelector(".quiz-feedback, [data-quiz-feedback]");
  }

  function correctAnswerSummary(item) {
    if (item.dataset.correctLabel) return item.dataset.correctLabel;

    const type = normalizeType(item.dataset.type);
    const optionText = (selector, value) => {
      const node = Array.from(item.querySelectorAll(selector))
        .find(element => element.dataset.value === value);
      return node ? node.textContent.trim() : value;
    };

    if (type === "single_select" || type === "true_false") {
      return optionText(".quiz-option", item.dataset.correct || "");
    }

    if (type === "multi_select") {
      return splitTokens(item.dataset.correctValues)
        .map(value => {
          const input = Array.from(item.querySelectorAll('.quiz-choice input[type="checkbox"]'))
            .find(element => element.value === value);
          const label = input?.closest(".quiz-choice");
          return label ? label.textContent.trim() : value;
        })
        .join("، ");
    }

    if (type === "matching" || type === "fill_select" || type === "categorization") {
      return Array.from(item.querySelectorAll("select[data-answer]")).map(select => {
        const row = select.closest(".matching-row, .category-row, .quiz-field-row") || select.parentElement;
        const label = row?.querySelector(".matching-term, .category-term, .quiz-field-label, label")?.textContent?.trim();
        const answer = Array.from(select.options).find(option => option.value === select.dataset.answer);
        return `${label ? `${label}: ` : ""}${answer?.textContent?.trim() || select.dataset.answer}`;
      }).join("؛ ");
    }

    if (type === "short_answer") {
      const input = item.querySelector("input[data-answers], textarea[data-answers]");
      return input ? (input.dataset.answers || "").split("|")[0].trim() : "";
    }

    if (type === "fill_text") {
      return Array.from(item.querySelectorAll("input[data-answers], textarea[data-answers]"))
        .map(input => {
          const row = input.closest(".quiz-field-row, label") || input.parentElement;
          const label = row?.querySelector(".quiz-field-label")?.textContent?.trim();
          const answer = (input.dataset.answers || "").split("|")[0].trim();
          return `${label ? `${label}: ` : ""}${answer}`;
        }).join("؛ ");
    }

    if (type === "ordering") {
      const list = item.querySelector(".ordering-list");
      const expected = splitTokens(item.dataset.correctOrder);
      if (!list) return "";
      return expected.map(value => {
        const node = Array.from(list.querySelectorAll(".ordering-item"))
          .find(element => element.dataset.value === value);
        return node?.querySelector("span")?.textContent?.trim() || value;
      }).join(" ← ");
    }

    return "";
  }

  function setFeedback(item, isCorrect, customMessage) {
    const node = getFeedbackNode(item);
    if (!node) return;

    const correctMessage = item.dataset.feedbackCorrect || "پاسخ شما درست است.";
    const incorrectMessage = item.dataset.feedbackIncorrect || "پاسخ شما درست نیست.";
    let message = customMessage || (isCorrect ? correctMessage : incorrectMessage);

    if (!isCorrect && !customMessage) {
      const answer = correctAnswerSummary(item);
      if (answer) message += ` پاسخ صحیح: ${answer}`;
    }

    node.textContent = message;
    node.classList.remove("is-correct", "is-incorrect");
    node.classList.add("is-visible", isCorrect ? "is-correct" : "is-incorrect");
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
  }

  function clearFeedback(item) {
    const node = getFeedbackNode(item);
    if (!node) return;
    node.textContent = "";
    node.classList.remove("is-visible", "is-correct", "is-incorrect");
    node.removeAttribute("role");
  }

  function updateProgress(root, completed, total) {
    const counter = root.querySelector("[data-quiz-counter]");
    const nativeProgress = root.querySelector("progress[data-quiz-progress]");
    const progressTrack = root.querySelector('[role="progressbar"], .quiz-progress');
    const progressBar = root.querySelector(".quiz-progress__bar[data-quiz-progress], [data-quiz-progress]");
    const percent = total ? Math.round((completed / total) * 100) : 0;

    if (counter) {
      counter.textContent = `${completed} از ${total} سؤال پاسخ داده‌شده`;
      counter.setAttribute("aria-live", "polite");
    }

    if (nativeProgress) {
      nativeProgress.value = percent;
      nativeProgress.setAttribute("aria-label", `پیشرفت آزمون: ${percent} درصد`);
    } else if (progressTrack) {
      progressTrack.setAttribute("role", "progressbar");
      progressTrack.setAttribute("aria-valuemin", "0");
      progressTrack.setAttribute("aria-valuemax", "100");
      progressTrack.setAttribute("aria-valuenow", String(percent));
      progressTrack.setAttribute("aria-label", `پیشرفت آزمون: ${percent} درصد`);
      if (progressBar && progressBar !== progressTrack) {
        progressBar.style.width = `${percent}%`;
      } else if (progressBar) {
        progressBar.style.width = `${percent}%`;
      }
    }
  }

  function updateResult(root, score, total, pointsEarned, pointsPossible) {
    const result = root.querySelector("[data-quiz-result]");
    if (!result) return;

    const scoreNode = result.querySelector("[data-quiz-score]");
    const detailNode = result.querySelector("[data-quiz-result-detail]");
    const percent = pointsPossible ? Math.round((pointsEarned / pointsPossible) * 100) : 0;

    result.classList.add("is-visible");
    result.setAttribute("tabindex", "-1");
    result.setAttribute("aria-live", "polite");

    if (scoreNode) {
      scoreNode.textContent = `${score} از ${total} سؤال · ${percent}٪`;
    }

    if (detailNode) {
      detailNode.textContent = percent === 100
        ? "عالی است؛ به تمام پرسش‌ها درست پاسخ دادید."
        : percent >= 80
          ? "عملکرد بسیار خوبی داشتید. پاسخ‌های نادرست را مرور کنید تا یادگیری کامل‌تر شود."
          : percent >= 60
            ? "نتیجه قابل‌قبولی است؛ مرور پرسش‌های نادرست به تثبیت مفاهیم کمک می‌کند."
            : "پیشنهاد می‌شود درسنامه را دوباره مرور کنید و سپس آزمون را تکرار کنید.";
    }
  }

  function lockQuestion(item) {
    item.querySelectorAll("input, textarea, select, button.quiz-option, .ordering-move, [data-quiz-submit]")
      .forEach(control => {
        if (!control.matches("[data-quiz-reset]")) control.disabled = true;
      });
  }

  function revealSingleSelect(item, selectedButton) {
    const correctValue = item.dataset.correct;
    item.querySelectorAll(".quiz-option").forEach(option => {
      option.classList.remove("is-selected", "is-correct", "is-incorrect");
      if (option.dataset.value === correctValue) option.classList.add("is-correct");
    });
    if (selectedButton && selectedButton.dataset.value !== correctValue) {
      selectedButton.classList.add("is-selected", "is-incorrect");
    } else if (selectedButton) {
      selectedButton.classList.add("is-selected", "is-correct");
    }
  }

  function finishQuestion(root, item, isCorrect) {
    if (item.dataset.evaluated === "true") return;

    const points = Math.max(0, Number(item.dataset.points || 1));
    item.dataset.evaluated = "true";
    item.dataset.correctResult = String(Boolean(isCorrect));
    item.dataset.awardedPoints = isCorrect ? String(points) : "0";
    item.classList.remove("is-correct", "is-incorrect");
    item.classList.add(isCorrect ? "is-correct" : "is-incorrect");

    setFeedback(item, Boolean(isCorrect));
    lockQuestion(item);
    refreshSummary(root);
  }

  function getQuestionState(item) {
    const type = normalizeType(item.dataset.type);

    if (type === "single_select" || type === "true_false") {
      const selected = item.querySelector(".quiz-option.is-selected");
      return {
        complete: Boolean(selected),
        correct: Boolean(selected) && selected.dataset.value === item.dataset.correct
      };
    }

    if (type === "multi_select") {
      const checkboxes = Array.from(item.querySelectorAll('input[type="checkbox"]'));
      const selected = checkboxes.filter(input => input.checked).map(input => input.value).sort();
      const expected = splitTokens(item.dataset.correctValues).sort();
      const complete = item.dataset.submitted === "true" && selected.length > 0;
      return {
        complete,
        correct: complete &&
          selected.length === expected.length &&
          selected.every((value, index) => value === expected[index])
      };
    }

    if (type === "matching" || type === "fill_select" || type === "categorization") {
      const controls = Array.from(item.querySelectorAll("select[data-answer]"));
      const complete = controls.length > 0 && controls.every(control => control.value !== "");
      return {
        complete,
        correct: complete && controls.every(control => control.value === control.dataset.answer)
      };
    }

    if (type === "short_answer") {
      const input = item.querySelector("input[data-answers], textarea[data-answers]");
      const complete = Boolean(input && item.dataset.submitted === "true" && normalizeText(input.value));
      const accepted = input ? splitAliases(input.dataset.answers) : [];
      return {
        complete,
        correct: complete && accepted.includes(normalizeText(input.value))
      };
    }

    if (type === "fill_text") {
      const inputs = Array.from(item.querySelectorAll("input[data-answers], textarea[data-answers]"));
      const complete = inputs.length > 0 &&
        item.dataset.submitted === "true" &&
        inputs.every(input => normalizeText(input.value));
      return {
        complete,
        correct: complete && inputs.every(input =>
          splitAliases(input.dataset.answers).includes(normalizeText(input.value)))
      };
    }

    if (type === "ordering") {
      const list = item.querySelector(".ordering-list");
      const current = list
        ? Array.from(list.querySelectorAll(".ordering-item")).map(node => node.dataset.value)
        : [];
      const expected = splitTokens(item.dataset.correctOrder);
      const complete = Boolean(list && item.dataset.submitted === "true" &&
        current.length > 0 && current.length === expected.length);
      return {
        complete,
        correct: complete && current.every((value, index) => value === expected[index])
      };
    }

    return { complete: false, correct: false, unsupported: true };
  }

  function decorateAnswer(item, isCorrect) {
    const type = normalizeType(item.dataset.type);

    if (type === "single_select" || type === "true_false") {
      const selected = item.querySelector(".quiz-option.is-selected");
      revealSingleSelect(item, selected);
    }

    if (type === "multi_select") {
      const expected = splitTokens(item.dataset.correctValues);
      item.querySelectorAll(".quiz-choice").forEach(label => {
        const input = label.querySelector('input[type="checkbox"]');
        if (!input) return;
        label.classList.remove("is-correct", "is-incorrect");
        if (expected.includes(input.value)) label.classList.add("is-correct");
        else if (input.checked) label.classList.add("is-incorrect");
      });
    }

    if (type === "matching" || type === "fill_select" || type === "categorization") {
      item.querySelectorAll("select[data-answer]").forEach(select => {
        select.classList.remove("is-correct", "is-incorrect");
        select.classList.add(select.value === select.dataset.answer ? "is-correct" : "is-incorrect");
      });
    }

    if (type === "ordering") {
      const list = item.querySelector(".ordering-list");
      const expected = splitTokens(item.dataset.correctOrder);
      if (list) {
        Array.from(list.querySelectorAll(".ordering-item")).forEach((node, index) => {
          node.classList.remove("is-correct", "is-incorrect");
          node.classList.add(node.dataset.value === expected[index] ? "is-correct" : "is-incorrect");
        });
      }
    }

    if (type === "short_answer" || type === "fill_text") {
      const inputs = item.querySelectorAll("input[data-answers], textarea[data-answers]");
      inputs.forEach(input => {
        const valid = splitAliases(input.dataset.answers).includes(normalizeText(input.value));
        input.classList.remove("is-correct", "is-incorrect");
        input.classList.add(valid ? "is-correct" : "is-incorrect");
      });
    }
  }

  function evaluateQuestion(root, item) {
    if (item.dataset.evaluated === "true") return false;
    const state = getQuestionState(item);

    if (state.unsupported) {
      setFeedback(item, false, `نوع سؤال «${item.dataset.type}» پشتیبانی نمی‌شود.`);
      return false;
    }

    if (!state.complete) return false;

    decorateAnswer(item, state.correct);
    finishQuestion(root, item, state.correct);
    return true;
  }

  function refreshSummary(root) {
    const items = getItems(root);
    const evaluatedItems = items.filter(item => item.dataset.evaluated === "true");
    const score = evaluatedItems.filter(item => item.dataset.correctResult === "true").length;
    const pointsPossible = items.reduce((sum, item) => sum + Math.max(0, Number(item.dataset.points || 1)), 0);
    const pointsEarned = evaluatedItems.reduce((sum, item) => sum + Math.max(0, Number(item.dataset.awardedPoints || 0)), 0);

    updateProgress(root, evaluatedItems.length, items.length);

    if (evaluatedItems.length === items.length && items.length > 0) {
      updateResult(root, score, items.length, pointsEarned, pointsPossible);
    } else {
      const result = root.querySelector("[data-quiz-result]");
      if (result) result.classList.remove("is-visible");
    }
  }

  function showIncomplete(item, message = "لطفاً ابتدا پاسخ این سؤال را کامل کنید.") {
    const node = getFeedbackNode(item);
    if (!node) return;
    node.textContent = message;
    node.classList.remove("is-correct", "is-incorrect");
    node.classList.add("is-visible");
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
  }

  function handleSubmit(root, item) {
    if (item.dataset.evaluated === "true") return;
    item.dataset.submitted = "true";

    const state = getQuestionState(item);
    if (!state.complete) {
      delete item.dataset.submitted;
      showIncomplete(item);
      return;
    }
    evaluateQuestion(root, item);
  }

  function moveOrderingItem(button) {
    const item = button.closest(".quiz-item");
    if (!item || item.dataset.evaluated === "true") return;
    const row = button.closest(".ordering-item");
    const list = row?.parentElement;
    if (!row || !list) return;

    if (button.dataset.move === "up" && row.previousElementSibling) {
      list.insertBefore(row, row.previousElementSibling);
    } else if (button.dataset.move === "down" && row.nextElementSibling) {
      list.insertBefore(row.nextElementSibling, row);
    }

    const live = item.querySelector("[data-ordering-status]");
    if (live) {
      const position = Array.from(list.children).indexOf(row) + 1;
      live.textContent = `مورد به جایگاه ${position} منتقل شد.`;
    }
  }

  function bindEvents(root) {
    root.addEventListener("click", event => {
      const option = event.target.closest(".quiz-option");
      if (option && root.contains(option)) {
        const item = option.closest(".quiz-item");
        if (!item || item.dataset.evaluated === "true") return;

        item.querySelectorAll(".quiz-option").forEach(button => {
          button.classList.remove("is-selected");
          button.setAttribute("aria-pressed", "false");
        });
        option.classList.add("is-selected");
        option.setAttribute("aria-pressed", "true");
        evaluateQuestion(root, item);
        return;
      }

      const submit = event.target.closest("[data-quiz-submit]");
      if (submit && root.contains(submit)) {
        const item = submit.closest(".quiz-item");
        if (item) handleSubmit(root, item);
        return;
      }

      const move = event.target.closest(".ordering-move");
      if (move && root.contains(move)) {
        moveOrderingItem(move);
        return;
      }

      const reset = event.target.closest("[data-quiz-reset]");
      if (reset && root.contains(reset)) {
        resetQuiz(root);
      }
    });

    root.addEventListener("change", event => {
      const control = event.target;
      if (control.matches('input[type="checkbox"]')) {
        const item = control.closest(".quiz-item");
        if (!item || item.dataset.evaluated === "true") return;
        // Multi-select is evaluated as soon as the learner submits the selection,
        // because the engine cannot know whether more choices are still intended.
        clearFeedback(item);
        return;
      }

      if (control.matches("select[data-answer]")) {
        const item = control.closest(".quiz-item");
        if (item && item.dataset.evaluated !== "true") {
          clearFeedback(item);
          evaluateQuestion(root, item); // instant once all fields are completed
        }
      }
    });

    root.addEventListener("keydown", event => {
      const input = event.target;
      if (event.key !== "Enter" || !input.matches("input[data-answers]")) return;
      const item = input.closest(".quiz-item");
      if (!item || normalizeType(item.dataset.type) !== "short_answer") return;
      event.preventDefault();
      handleSubmit(root, item);
    });

    root.addEventListener("submit", event => {
      const form = event.target.closest(".quiz-item");
      if (form) {
        event.preventDefault();
        handleSubmit(root, form);
      }
    });
  }

  function snapshotQuiz(root) {
    const snapshots = new Map();

    getItems(root).forEach(item => {
      const itemSnapshot = {
        className: item.className,
        optionClasses: new Map(),
        controls: new Map(),
        ordering: null
      };

      item.querySelectorAll(".quiz-option").forEach(node => {
        itemSnapshot.optionClasses.set(node, node.className);
      });

      item.querySelectorAll("input, textarea, select, button.quiz-option, .ordering-move, [data-quiz-submit]")
        .forEach(node => {
          itemSnapshot.controls.set(node, {
            disabled: node.disabled,
            value: "value" in node ? node.value : undefined,
            checked: "checked" in node ? node.checked : undefined,
            selectedIndex: node.tagName === "SELECT" ? node.selectedIndex : undefined,
            className: node.className
          });
        });

      const list = item.querySelector(".ordering-list");
      if (list) itemSnapshot.ordering = Array.from(list.children);

      snapshots.set(item, itemSnapshot);
    });

    initialSnapshots.set(root, snapshots);
  }

  function resetQuiz(root) {
    const snapshots = initialSnapshots.get(root);
    if (!snapshots) return;

    getItems(root).forEach(item => {
      const snapshot = snapshots.get(item);
      if (!snapshot) return;

      item.className = snapshot.className;
      delete item.dataset.evaluated;
      delete item.dataset.correctResult;
      delete item.dataset.awardedPoints;
      delete item.dataset.submitted;

      snapshot.controls.forEach((state, node) => {
        if (!node.isConnected) return;
        node.disabled = state.disabled;
        if (state.value !== undefined) node.value = state.value;
        if (state.checked !== undefined) node.checked = state.checked;
        if (state.selectedIndex !== undefined) node.selectedIndex = state.selectedIndex;
        if (state.className !== undefined) node.className = state.className;
      });

      snapshot.optionClasses.forEach((className, node) => {
        if (node.isConnected) {
          node.className = className;
          node.setAttribute("aria-pressed", node.classList.contains("is-selected") ? "true" : "false");
        }
      });

      if (snapshot.ordering) {
        const list = item.querySelector(".ordering-list");
        if (list) snapshot.ordering.forEach(node => list.appendChild(node));
      }

      clearFeedback(item);
      item.querySelectorAll(".quiz-control, .matching-select, .inline-select")
        .forEach(control => control.classList.remove("is-correct", "is-incorrect"));
      item.querySelectorAll(".quiz-choice, .ordering-item")
        .forEach(node => node.classList.remove("is-correct", "is-incorrect"));
    });

    const result = root.querySelector("[data-quiz-result]");
    if (result) result.classList.remove("is-visible");

    refreshSummary(root);
  }

  function initQuiz(root) {
    if (!(root instanceof Element) || initialized.has(root)) return;
    initialized.add(root);

    const items = getItems(root);
    items.forEach(item => {
      item.dataset.type = normalizeType(item.dataset.type);
      item.querySelectorAll(".quiz-option").forEach(option => {
        if (!option.hasAttribute("aria-pressed")) {
          option.setAttribute("aria-pressed", option.classList.contains("is-selected") ? "true" : "false");
        }
      });
      item.querySelectorAll(".ordering-item").forEach((node, index) => {
        if (!node.dataset.originalIndex) node.dataset.originalIndex = String(index);
      });
    });

    snapshotQuiz(root);
    bindEvents(root);
    refreshSummary(root);
    root.dataset.quizEngineVersion = VERSION;
  }

  function initAll(scope = document) {
    if (scope.matches?.(ROOT_SELECTOR)) initQuiz(scope);
    scope.querySelectorAll?.(ROOT_SELECTOR).forEach(initQuiz);
  }

  function resetAll() {
    document.querySelectorAll(ROOT_SELECTOR).forEach(resetQuiz);
  }

  // Public, intentionally small API for optional custom controls.
  window.QuizEngine = Object.freeze({
    version: VERSION,
    init: initAll,
    reset: resetQuiz,
    resetAll,
    normalizeText
  });

  function start() {
    initAll(document);

    // Supports quiz sections inserted later by tabs, modals, or dynamic page content.
    if ("MutationObserver" in window) {
      const observer = new MutationObserver(records => {
        records.forEach(record => {
          record.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) initAll(node);
          });
        });
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
