import { Info } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";
import type { RequestInputToolInput } from "~/components/onboarding-chat-types";

const OPTION_RE = /^([A-Z])[).]\s+(.+)$/gm;

export function parseOptions(text: string): {
  body: string;
  options: Array<{ key: string; label: string }>;
  isMultiSelect: boolean;
} {
  const options: Array<{ key: string; label: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = OPTION_RE.exec(text)) !== null) {
    options.push({
      key: match[1],
      label: match[2].replace(/\*\*/g, "").trim(),
    });
  }

  const body = text.replace(OPTION_RE, "").trim();
  OPTION_RE.lastIndex = 0;

  const isMultiSelect = /pick multiple|select multiple|choose multiple|more than one|select all that/i.test(text);
  return {
    body,
    options: options.length >= 2 ? options : [],
    isMultiSelect,
  };
}

export function PaginatedCard({
  steps,
  onComplete,
}: {
  steps: RequestInputToolInput[];
  onComplete?: (value: string) => void;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Map<number, { keys: string[]; customText?: string; skipped?: boolean }>>(
    new Map(),
  );

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;
  const currentAnswer = answers.get(currentStep);

  const handleStepAnswer = useCallback(
    (keys: string[], customText?: string) => {
      setAnswers((prev) => {
        const existing = prev.get(currentStep);
        const sameKeys = existing?.keys.join(",") === keys.join(",");
        const sameCustom = (existing?.customText ?? undefined) === (customText ?? undefined);
        if (sameKeys && sameCustom) return prev;
        const next = new Map(prev);
        next.set(currentStep, { keys, customText });
        return next;
      });
    },
    [currentStep],
  );

  const submitAll = () => {
    const parts: string[] = [];
    for (let index = 0; index < steps.length; index += 1) {
      const answer = answers.get(index);
      if (!answer || answer.skipped) continue;
      if (answer.customText) {
        parts.push(answer.customText);
        continue;
      }
      if (answer.keys.length > 0) {
        const labels = answer.keys.map((key) => steps[index].options.find((option) => option.key === key)?.label ?? key);
        parts.push(labels.join(", "));
      }
    }
    onComplete?.(parts.join("\n"));
  };

  return (
    <div
      style={{
        marginTop: 14,
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: RADIUS.lg,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 16px 10px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <span
          style={{
            fontSize: TYPE.scale.base,
            fontFamily: TYPE.body,
            fontWeight: TYPE.weight.medium,
            color: COLORS.text,
            lineHeight: TYPE.leading.snug,
          }}
        >
          {step.question}
        </span>
        <span
          style={{
            fontSize: TYPE.scale.xs,
            fontFamily: TYPE.body,
            color: COLORS.textDim,
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          {currentStep + 1} / {steps.length}
        </span>
      </div>

      <OptionCards
        options={step.options}
        isMultiSelect={step.multiSelect}
        allowCustom={step.allowCustom}
        skippable={step.skippable}
        placeholder={step.placeholder}
        isPaginated
        initialKeys={currentAnswer?.keys}
        initialCustomText={currentAnswer?.customText}
        onSelectionChange={handleStepAnswer}
        onSkip={() => {
          setAnswers((prev) => {
            const next = new Map(prev);
            next.set(currentStep, { keys: [], skipped: true });
            return next;
          });
          if (isLast) {
            submitAll();
          } else {
            setCurrentStep((value) => value + 1);
          }
        }}
        onSubmit={() => {
          if (isLast) {
            submitAll();
          } else {
            setCurrentStep((value) => value + 1);
          }
        }}
        isLast={isLast}
      />
    </div>
  );
}

function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);

  return (
    <span
      role="tooltip"
      style={{ position: "relative", display: "inline-flex", alignItems: "center", flexShrink: 0 }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      <Info
        size={16}
        weight="regular"
        style={{
          color: COLORS.textDim,
          cursor: "help",
          transition: `color ${MOTION.duration} ${MOTION.ease}`,
          ...(show ? { color: COLORS.textSecondary } : {}),
        }}
      />
      {show ? (
        <span
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            right: 0,
            background: COLORS.surfaceHover,
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.md,
            padding: "8px 12px",
            fontSize: TYPE.scale.xs,
            fontFamily: TYPE.body,
            fontWeight: TYPE.weight.regular,
            color: COLORS.textSecondary,
            lineHeight: TYPE.leading.normal,
            whiteSpace: "normal",
            width: 240,
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}

export function OptionCards({
  options,
  isMultiSelect,
  allowCustom,
  skippable,
  placeholder,
  onOptionClick,
  isPaginated,
  initialKeys,
  initialCustomText,
  onSelectionChange,
  onSkip,
  onSubmit,
  isLast,
}: {
  options: Array<{ key: string; label: string; description?: string; selected?: boolean }>;
  isMultiSelect: boolean;
  allowCustom?: boolean;
  skippable?: boolean;
  placeholder?: string;
  onOptionClick?: (value: string) => void;
  isPaginated?: boolean;
  initialKeys?: string[];
  initialCustomText?: string;
  onSelectionChange?: (keys: string[], customText?: string) => void;
  onSkip?: () => void;
  onSubmit?: () => void;
  isLast?: boolean;
}) {
  const isTextOnly = options.length === 0 && allowCustom;
  const [toggled, setToggled] = useState<Set<string>>(
    () => new Set(initialKeys ?? options.filter((option) => option.selected).map((option) => option.key)),
  );
  const [customActive, setCustomActive] = useState(initialKeys?.includes("_custom") ?? isTextOnly);
  const [customText, setCustomText] = useState(initialCustomText ?? "");
  const customInputRef = useRef<HTMLInputElement>(null);
  const isActive = !!onOptionClick || isPaginated;

  useEffect(() => {
    if (isPaginated && onSelectionChange) {
      const keys = [...toggled];
      if (customActive) keys.push("_custom");
      onSelectionChange(keys, customActive ? customText : undefined);
    }
  }, [customActive, customText, isPaginated, onSelectionChange, toggled]);

  const optionsKey = options.map((option) => option.key).join(",");
  useEffect(() => {
    setToggled(new Set(initialKeys ?? options.filter((option) => option.selected).map((option) => option.key)));
    setCustomActive(initialKeys?.includes("_custom") ?? isTextOnly);
    setCustomText(initialCustomText ?? "");
  }, [optionsKey]);

  const handleToggle = (key: string) => {
    if (!isActive) return;

    if (isMultiSelect) {
      setToggled((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      if (customActive) {
        setCustomActive(false);
        setCustomText("");
      }
      return;
    }

    if (!isPaginated) {
      const option = options.find((item) => item.key === key);
      onOptionClick?.(option?.label ?? key);
      return;
    }

    setToggled(new Set([key]));
    if (customActive) {
      setCustomActive(false);
      setCustomText("");
    }
  };

  const handleConfirm = () => {
    if (isPaginated) {
      onSubmit?.();
      return;
    }
    if (customActive && customText.trim()) {
      onOptionClick?.(customText.trim());
      return;
    }
    if (toggled.size > 0) {
      onOptionClick?.([...toggled].join(", "));
    }
  };

  const showFooter = isActive && (isTextOnly || isMultiSelect || isPaginated || skippable || (customActive && customText.trim()));

  return (
    <div
      style={
        isPaginated
          ? {}
          : {
              marginTop: 14,
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.lg,
              overflow: "hidden",
            }
      }
    >
      {options.map((option, index) => {
        const isSelected = toggled.has(option.key);
        const isLastOption = !allowCustom && index === options.length - 1 && !showFooter;

        return (
          <button
            type="button"
            key={option.key}
            className={isActive ? "btn" : undefined}
            onClick={() => handleToggle(option.key)}
            disabled={!isActive}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              padding: "14px 16px",
              background: isSelected ? COLORS.accentDim : "transparent",
              border: "none",
              borderLeft: `3px solid ${isSelected ? COLORS.accent : "transparent"}`,
              borderBottom: isLastOption ? "none" : `1px solid ${COLORS.border}`,
              color: COLORS.text,
              fontSize: TYPE.scale.base,
              fontFamily: TYPE.body,
              textAlign: "left",
              cursor: isActive ? "pointer" : "default",
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: isMultiSelect ? 4 : 999,
                border: `1.5px solid ${isSelected ? COLORS.accent : COLORS.borderStrong}`,
                background: isSelected ? COLORS.accent : "transparent",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: COLORS.white,
                fontSize: 11,
                flexShrink: 0,
              }}
            >
              {isSelected ? "✓" : ""}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span>{option.label}</span>
                {option.description ? <InfoTooltip text={option.description} /> : null}
              </span>
            </span>
          </button>
        );
      })}

      {allowCustom && isTextOnly ? (
        <div style={{ padding: "14px 16px" }}>
          <input
            ref={customInputRef}
            value={customText}
            onChange={(event) => setCustomText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && customText.trim()) {
                handleConfirm();
              }
            }}
            placeholder={placeholder ?? "Type your answer"}
            autoFocus
            style={{
              width: "100%",
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.md,
              background: COLORS.bg,
              color: COLORS.text,
              padding: "10px 12px",
              fontSize: TYPE.scale.sm,
              fontFamily: TYPE.body,
              outline: "none",
            }}
          />
        </div>
      ) : allowCustom ? (
        <div
          style={{
            padding: "14px 16px",
            borderTop: `1px solid ${COLORS.border}`,
            background: customActive ? COLORS.surfaceHover : "transparent",
          }}
        >
          <button
            type="button"
            className={isActive ? "btn" : undefined}
            onClick={() => {
              if (!isActive) return;
              if (customActive) {
                setCustomActive(false);
                setCustomText("");
              } else {
                setCustomActive(true);
                if (!isMultiSelect) setToggled(new Set());
                setTimeout(() => customInputRef.current?.focus(), 0);
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "transparent",
              border: "none",
              padding: 0,
              color: COLORS.text,
              cursor: isActive ? "pointer" : "default",
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: isMultiSelect ? 4 : 999,
                border: `1.5px solid ${customActive ? COLORS.accent : COLORS.borderStrong}`,
                background: customActive ? COLORS.accent : "transparent",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: COLORS.white,
                fontSize: 11,
              }}
            >
              {customActive ? "✓" : ""}
            </span>
            <span>Something else</span>
          </button>

          {customActive ? (
            <div style={{ marginTop: 12 }}>
              <input
                ref={customInputRef}
                value={customText}
                onChange={(event) => setCustomText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && customText.trim()) {
                    handleConfirm();
                  }
                }}
                placeholder={placeholder ?? "Type your answer"}
                style={{
                  width: "100%",
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: RADIUS.md,
                  background: COLORS.bg,
                  color: COLORS.text,
                  padding: "10px 12px",
                  fontSize: TYPE.scale.sm,
                  fontFamily: TYPE.body,
                  outline: "none",
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {showFooter ? (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            padding: "12px 16px",
            borderTop: `1px solid ${COLORS.border}`,
          }}
        >
          {skippable ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (isPaginated) onSkip?.();
                else onOptionClick?.("_skipped");
              }}
              style={{
                border: "none",
                background: "transparent",
                color: COLORS.textDim,
                fontSize: TYPE.scale.sm,
                cursor: "pointer",
              }}
            >
              Skip
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="btn"
            onClick={handleConfirm}
            disabled={toggled.size === 0 && !(customActive && customText.trim())}
            style={{
              border: "none",
              borderRadius: RADIUS.md,
              background: COLORS.accent,
              color: COLORS.white,
              padding: "8px 14px",
              fontSize: TYPE.scale.sm,
              fontWeight: TYPE.weight.semibold,
              cursor: "pointer",
            }}
          >
            {isPaginated ? (isLast ? "Submit" : "Next") : "Confirm"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
