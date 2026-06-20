import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ChatMessage } from '../../core/models/chat.model';
import { MessageBubble } from '../message-bubble/message-bubble';
import { WelcomeScreen } from '../welcome-screen/welcome-screen';

@Component({
  selector: 'app-chat-window',
  imports: [MessageBubble, WelcomeScreen],
  templateUrl: './chat-window.html',
  styleUrl: './chat-window.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatWindow implements AfterViewInit {
  readonly messages = input<ChatMessage[]>([]);
  readonly promptSelected = output<string>();
  readonly showScrollToBottom = signal(false);

  private readonly chatWindow = viewChild<ElementRef<HTMLDivElement>>('chatWindow');
  private readonly scrollAnchor = viewChild<ElementRef<HTMLDivElement>>('scrollAnchor');

  constructor() {
    effect(() => {
      // Re-run whenever message count or the latest message's content changes.
      const list = this.messages();
      const lastLength = list.at(-1)?.content.length ?? 0;
      void lastLength;
      void list.length;
      this.scrollToBottom();
    });
  }

  ngAfterViewInit(): void {
    this.updateScrollButtonState();
  }

  onScroll(): void {
    this.updateScrollButtonState();
  }

  scrollToBottom(): void {
    queueMicrotask(() => {
      this.scrollAnchor()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
      this.showScrollToBottom.set(false);
    });
  }

  private updateScrollButtonState(): void {
    const container = this.chatWindow()?.nativeElement;
    if (!container) {
      return;
    }

    const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 16;
    this.showScrollToBottom.set(!isAtBottom);
  }
}
