<script lang="ts">
  import { untrack } from "svelte";
  import { t } from "$lib/i18n";
  import type { AskUserField, UserInputRequest } from "$lib/types";

  interface Props {
    request: UserInputRequest;
    onSubmit: (requestId: string, values: Record<string, unknown>) => void;
    onCancel: (requestId: string) => void;
  }

  let { request, onSubmit, onCancel }: Props = $props();

  function initialValue(field: AskUserField): unknown {
    switch (field.type) {
      case "text":
      case "textarea":
      case "date":
      case "select":
        return field.default ?? "";
      case "checkbox":
      case "confirm":
        return field.default ?? false;
      case "checkbox_group":
        return field.default ?? [];
    }
  }

  // Snapshot the initial values once. The parent re-keys this component on a
  // new request_id, so we never need to react to `request` changing in place.
  function buildInitial(req: UserInputRequest): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of req.fields) out[f.name] = initialValue(f);
    return out;
  }
  let values = $state<Record<string, unknown>>(untrack(() => buildInitial(request)));

  // Track which required-but-empty fields the user has tried to submit so we
  // can flag them inline without nagging before the first attempt.
  let showErrors = $state(false);

  function isEmpty(field: AskUserField, value: unknown): boolean {
    switch (field.type) {
      case "text":
      case "textarea":
      case "date":
        return typeof value !== "string" || value.trim() === "";
      case "select":
        return typeof value !== "string" || value === "";
      default:
        return false;
    }
  }

  function isRequired(field: AskUserField): boolean {
    return "required" in field ? field.required === true : false;
  }

  function fieldHasError(field: AskUserField): boolean {
    return showErrors && isRequired(field) && isEmpty(field, values[field.name]);
  }

  function submit() {
    const missing = request.fields.some((f) => isRequired(f) && isEmpty(f, values[f.name]));
    if (missing) {
      showErrors = true;
      return;
    }
    // A confirm field represents the decision made by the primary action. This
    // keeps approval forms to one decisive click instead of requiring the user
    // to first choose "Submit" and then submit the whole form again.
    for (const field of request.fields) {
      if (field.type === "confirm") values[field.name] = true;
    }
    onSubmit(request.request_id, values);
  }

  function cancel() {
    onCancel(request.request_id);
  }

  function toggleGroup(name: string, option: string) {
    const list = (values[name] as string[]) ?? [];
    values[name] = list.includes(option) ? list.filter((o) => o !== option) : [...list, option];
  }

  const inputBase =
    "w-full box-border py-1.5 px-[9px] rounded-md bg-[var(--bg)] text-[var(--text)] text-[13px] [font-family:inherit] outline-none transition-colors duration-[120ms]";
  function inputCls(field: AskUserField): string {
    return fieldHasError(field)
      ? `${inputBase} border border-[#ef4444]`
      : `${inputBase} border border-[var(--border)] focus:border-[var(--primary)]`;
  }
</script>

<div
  class="flex flex-col gap-3 my-2 px-4 py-[14px] rounded-[10px] border border-[var(--border)] bg-[var(--user-message-bg)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
  role="dialog"
  aria-label={request.title ?? $t("askUserDefaultTitle")}
>
  <div class="flex items-center gap-2 font-semibold text-[var(--text)] text-[13px]">
    <span>{request.title ?? $t("askUserDefaultTitle")}</span>
  </div>

  {#if request.description}
    <p class="m-0 text-[var(--text-muted)] text-[12px] leading-[1.5] whitespace-pre-wrap">
      {request.description}
    </p>
  {/if}

  <div class="flex flex-col gap-[10px]">
    {#each request.fields as field (field.name)}
      <div class="flex flex-col gap-1">
        {#if field.type === "checkbox"}
          <label
            class="flex items-center gap-2 text-[13px] text-[var(--text)] cursor-pointer select-none"
          >
            <input
              type="checkbox"
              class="accent-[var(--primary)]"
              checked={Boolean(values[field.name])}
              onchange={(e) => (values[field.name] = e.currentTarget.checked)}
            />
            <span>{field.label}</span>
          </label>
        {:else if field.type === "confirm"}
          <span class="text-[13px] text-[var(--text)]">{field.label}</span>
        {:else if field.type === "checkbox_group"}
          <span class="text-[12px] text-[var(--text-muted)] font-medium">
            {field.label}
            {#if isRequired(field)}<span class="text-[#ef4444] ml-0.5">*</span>{/if}
          </span>
          <div class="flex flex-col gap-1 mt-0.5">
            {#each field.options as option (option)}
              <label
                class="flex items-center gap-2 text-[13px] text-[var(--text)] cursor-pointer select-none"
              >
                <input
                  type="checkbox"
                  class="accent-[var(--primary)]"
                  checked={((values[field.name] as string[]) ?? []).includes(option)}
                  onchange={() => toggleGroup(field.name, option)}
                />
                <span>{option}</span>
              </label>
            {/each}
          </div>
        {:else}
          <label
            class="text-[12px] text-[var(--text-muted)] font-medium"
            for={`f-${request.request_id}-${field.name}`}
          >
            {field.label}
            {#if isRequired(field)}<span class="text-[#ef4444] ml-0.5">*</span>{/if}
          </label>
          {#if field.type === "text"}
            <input
              id={`f-${request.request_id}-${field.name}`}
              type="text"
              class={inputCls(field)}
              placeholder={field.placeholder ?? ""}
              value={String(values[field.name] ?? "")}
              oninput={(e) => (values[field.name] = e.currentTarget.value)}
            />
          {:else if field.type === "textarea"}
            <textarea
              id={`f-${request.request_id}-${field.name}`}
              class="{inputCls(field)} resize-y min-h-[60px]"
              placeholder={field.placeholder ?? ""}
              value={String(values[field.name] ?? "")}
              rows="3"
              oninput={(e) => (values[field.name] = e.currentTarget.value)}></textarea>
          {:else if field.type === "select"}
            <select
              id={`f-${request.request_id}-${field.name}`}
              class={inputCls(field)}
              value={String(values[field.name] ?? "")}
              onchange={(e) => (values[field.name] = e.currentTarget.value)}
            >
              <option value="" disabled>—</option>
              {#each field.options as option (option)}
                <option value={option}>{option}</option>
              {/each}
            </select>
          {:else if field.type === "date"}
            <input
              id={`f-${request.request_id}-${field.name}`}
              type="date"
              class={inputCls(field)}
              value={String(values[field.name] ?? "")}
              oninput={(e) => (values[field.name] = e.currentTarget.value)}
            />
          {/if}
        {/if}
        {#if fieldHasError(field)}
          <span class="text-[11px] text-[#ef4444]">{$t("askUserRequired")}</span>
        {/if}
      </div>
    {/each}
  </div>

  <div class="flex justify-end gap-2 mt-0.5">
    <button
      type="button"
      class="px-[14px] py-1.5 rounded-md text-[13px] cursor-pointer transition-colors duration-[120ms] bg-transparent text-[var(--text-muted)] border border-[var(--border)] hover:bg-[var(--surface2)]"
      onclick={cancel}
    >
      {request.cancel_label ?? $t("askUserCancel")}
    </button>
    <button
      type="button"
      class="px-[14px] py-1.5 rounded-md text-[13px] font-medium cursor-pointer transition-colors duration-[120ms] bg-[var(--primary)] text-white border border-transparent hover:bg-[var(--primary-hover)]"
      onclick={submit}
    >
      {request.submit_label ?? $t("askUserSubmit")}
    </button>
  </div>
</div>
