export interface InterruptResolutionStart {
  firstForConversation: boolean;
}

/**
 * Tracks in-flight interrupt responses by their durable request ID.
 *
 * Several approval cards from one provider batch may be submitted before the
 * first resume finishes. The runtime serializes those conversation mutations;
 * the frontend only rejects a duplicate response for the exact same request.
 */
export class InterruptResolutionTracker {
  private readonly conversationByRequest = new Map<string, string>();

  begin(requestId: string, conversationId: string): InterruptResolutionStart | null {
    if (this.conversationByRequest.has(requestId)) return null;
    const firstForConversation = !this.hasConversation(conversationId);
    this.conversationByRequest.set(requestId, conversationId);
    return { firstForConversation };
  }

  finish(requestId: string): void {
    this.conversationByRequest.delete(requestId);
  }

  hasOtherInConversation(conversationId: string, requestId: string): boolean {
    for (const [activeRequestId, activeConversationId] of this.conversationByRequest) {
      if (activeRequestId !== requestId && activeConversationId === conversationId) return true;
    }
    return false;
  }

  get size(): number {
    return this.conversationByRequest.size;
  }

  private hasConversation(conversationId: string): boolean {
    for (const activeConversationId of this.conversationByRequest.values()) {
      if (activeConversationId === conversationId) return true;
    }
    return false;
  }
}
