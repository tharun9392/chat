/**
 * Message loading utility with pagination support
 * Handles efficient message fetching with limit/skip
 */

export interface MessagePageOptions {
  skip: number;
  limit: number;
  chatId: string;
}

export interface MessagePageResult {
  messages: any[];
  total: number;
  hasMore: boolean;
}

const API_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5002/api';
const DEFAULT_PAGE_SIZE = 20;

/**
 * Fetch paginated messages for a chat
 */
export async function fetchMessagesPage(
  chatId: string,
  skip: number = 0,
  limit: number = DEFAULT_PAGE_SIZE,
  token: string
): Promise<MessagePageResult> {
  try {
    const response = await fetch(
      `${API_URL}/chats/${chatId}?skip=${skip}&limit=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch messages: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      messages: data.messages || data.chat?.messages || [],
      total: data.total || (data.chat?.messages?.length || 0),
      hasMore: (data.messages?.length || 0) === limit
    };
  } catch (error) {
    console.error('Error fetching messages:', error);
    throw error;
  }
}

/**
 * Batch load initial messages efficiently
 */
export async function loadInitialMessages(
  chatId: string,
  token: string,
  pageSize: number = DEFAULT_PAGE_SIZE
): Promise<MessagePageResult> {
  return fetchMessagesPage(chatId, 0, pageSize, token);
}

/**
 * Load older messages (for infinite scroll up)
 */
export async function loadOlderMessages(
  chatId: string,
  currentOffset: number,
  token: string,
  pageSize: number = DEFAULT_PAGE_SIZE
): Promise<MessagePageResult> {
  return fetchMessagesPage(chatId, currentOffset, pageSize, token);
}

/**
 * Manage message pagination state
 */
export class MessagePaginationManager {
  private chatId: string;
  private token: string;
  private messages: any[] = [];
  private currentPage = 0;
  private pageSize = DEFAULT_PAGE_SIZE;
  private hasMorePages = true;
  private isLoading = false;

  constructor(chatId: string, token: string, pageSize: number = DEFAULT_PAGE_SIZE) {
    this.chatId = chatId;
    this.token = token;
    this.pageSize = pageSize;
  }

  /**
   * Load next page of messages
   */
  async loadNextPage(): Promise<any[]> {
    if (this.isLoading || !this.hasMorePages) {
      return [];
    }

    this.isLoading = true;
    try {
      const skip = this.currentPage * this.pageSize;
      const result = await fetchMessagesPage(
        this.chatId,
        skip,
        this.pageSize,
        this.token
      );

      this.messages = [...this.messages, ...result.messages];
      this.hasMorePages = result.hasMore;
      this.currentPage++;

      return result.messages;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Get all loaded messages
   */
  getMessages(): any[] {
    return this.messages;
  }

  /**
   * Add new message to the list
   */
  addMessage(message: any): void {
    this.messages.push(message);
  }

  /**
   * Check if there are more pages to load
   */
  hasMore(): boolean {
    return this.hasMorePages;
  }

  /**
   * Reset pagination
   */
  reset(): void {
    this.messages = [];
    this.currentPage = 0;
    this.hasMorePages = true;
    this.isLoading = false;
  }

  /**
   * Update chat data
   */
  setChatId(chatId: string): void {
    this.chatId = chatId;
    this.reset();
  }
}
