import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  effect,
  computed,
  input,
  Injector,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SessionStore } from '../../core/services/session.store';

@Component({
  selector: 'app-chat-input',
  imports: [FormsModule],
  templateUrl: './chat-input.html',
  styleUrl: './chat-input.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatInput {
  readonly disabled = input<boolean>(false);
  readonly streaming = input<boolean>(false);

  readonly send = output<string>();
  readonly stop = output<void>();

  // Signal instead of a plain field: in zoneless mode, reading a signal
  // inside the autoGrow effect is what makes the resize re-run reliably
  // every time the text changes, instead of depending on manually timed
  // DOM reads after change detection (which is what was causing the
  // textarea to resize a tick late / not at all).
  protected readonly value = signal('');

  private readonly textarea = viewChild<ElementRef<HTMLTextAreaElement>>('textarea');

  private static readonly QUICK_PROMPTS = [
    'What is diabetes?',
    'Symptoms of seasonal flu',
    'How do antibiotics work?',
    'When should I see a doctor for a fever?',
  ];

  readonly quickPrompts = ChatInput.QUICK_PROMPTS;

  private readonly store = inject(SessionStore);

  readonly showQuickPrompts = computed(() => (this.store.activeMessages() ?? []).length === 0);

  constructor() {
    // Capture an injector instance and pass it to afterNextRender so the
    // callback runs with a valid injection context even when scheduled from
    // an effect.
    const inj = inject(Injector);

    // Runs after the next render to ensure the textarea is in the DOM.
    afterNextRender(() => this.autoGrow(), { injector: inj });

    effect(() => {
      this.value();
      afterNextRender(() => this.autoGrow(), { injector: inj });
    });
  }

  onModelChange(next: string): void {
    this.value.set(next);
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    this.trySend();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.trySend();
    }
  }

  useQuickPrompt(prompt: string): void {
    this.value.set(prompt);
    this.trySend();
  }

  autoGrow(): void {
    const el = this.textarea()?.nativeElement;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  private trySend(): void {
    const trimmed = this.value().trim();
    if (!trimmed || this.disabled()) return;
    this.send.emit(trimmed);
    this.value.set('');
  }
}
