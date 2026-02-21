import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, KeyboardAvoidingView, Platform, ScrollView,
  ActivityIndicator, Alert
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsApi, scriptsApi } from '@/api/client';
import { useAppStore } from '@/store';
import type { Project } from '@/store';

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const API_KEY = process.env.EXPO_PUBLIC_API_KEY || '';

if (!API_URL) {
  console.warn('[Chat] EXPO_PUBLIC_API_URL is not set. Chat will not work.');
}

const SSE_TIMEOUT_MS = 60_000;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const quickChips = ['Hook ideas', 'Add CTA', 'Viral frameworks', 'Tone check'];

export default function ChatScreen() {
  const queryClient = useQueryClient();
  const selectedProjectId = useAppStore((s) => s.selectedProjectId);
  const setSelectedProject = useAppStore((s) => s.setSelectedProject);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Fetch projects for the picker
  const { data: projects } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: projectsApi.list,
  });

  // Load existing script and conversation when project changes
  useEffect(() => {
    if (!selectedProjectId) {
      setMessages([]);
      setScriptId(null);
      return;
    }
    loadExistingConversation(selectedProjectId);
  }, [selectedProjectId]);

  const loadExistingConversation = async (projectId: string) => {
    try {
      const project = await projectsApi.get(projectId);
      const scripts = project.scripts;
      if (scripts && scripts.length > 0) {
        const existingScript = scripts[0];
        setScriptId(existingScript.id);
        // Load chat history
        const scriptData = await scriptsApi.get(existingScript.id);
        if (scriptData.messages && scriptData.messages.length > 0) {
          setMessages(scriptData.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
          })));
        } else {
          setMessages([{
            id: 'welcome',
            role: 'assistant',
            content: "Hi! I'm your Script Co-Pilot. What kind of video are you planning today?",
          }]);
        }
      } else {
        setScriptId(null);
        setMessages([{
          id: 'welcome',
          role: 'assistant',
          content: "Hi! I'm your Script Co-Pilot. What kind of video are you planning today?",
        }]);
      }
    } catch {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: "Hi! I'm your Script Co-Pilot. What kind of video are you planning today?",
      }]);
    }
  };

  const ensureScript = async (): Promise<string> => {
    if (scriptId) return scriptId;
    if (!selectedProjectId) throw new Error('No project selected');

    const script = await scriptsApi.create({
      project_id: selectedProjectId,
      title: 'Script Co-Pilot Session',
    });
    setScriptId(script.id);
    return script.id;
  };

  const handleSend = useCallback(async (text: string = input) => {
    if (!text.trim() || isStreaming) return;

    if (!selectedProjectId) {
      setShowProjectPicker(true);
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);

    // Add placeholder AI message for streaming
    const aiMessageId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: aiMessageId, role: 'assistant', content: '' }]);

    try {
      const currentScriptId = await ensureScript();

      if (!API_URL) {
        throw new Error('API URL is not configured. Set EXPO_PUBLIC_API_URL.');
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SSE_TIMEOUT_MS);

      try {
        const response = await fetch(`${API_URL}/api/scripts/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
            'Accept': 'text/event-stream',
          },
          body: JSON.stringify({
            script_id: currentScriptId,
            message: text.trim(),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);

            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                throw new Error(parsed.error);
              }
              if (parsed.text) {
                fullText += parsed.text;
                setMessages(prev =>
                  prev.map(m => m.id === aiMessageId ? { ...m, content: fullText } : m)
                );
              }
            } catch (parseErr: any) {
              if (parseErr.message && !parseErr.message.includes('JSON')) {
                throw parseErr;
              }
            }
          }
        }

      // If we got no text, show a fallback
      if (!fullText) {
        setMessages(prev =>
          prev.map(m => m.id === aiMessageId
            ? { ...m, content: "I'm having trouble connecting right now. Please try again." }
            : m)
        );
      }
      } finally {
        clearTimeout(timeout);
      }
    } catch (err: any) {
      const isTimeout = err.name === 'AbortError';
      const message = isTimeout
        ? 'The request timed out. Please try again.'
        : `Sorry, I couldn't connect to the AI service. ${err.message || 'Please try again.'}`;
      console.error('[Chat SSE Error]', err);
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && !last.content) {
          return prev.map(m => m.id === last.id
            ? { ...m, content: message }
            : m);
        }
        return prev;
      });
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, selectedProjectId, scriptId]);

  useEffect(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages, isStreaming]);

  const selectedProject = projects?.find(p => p.id === selectedProjectId);

  const renderMessage = ({ item }: { item: Message }) => (
    <View id={`chat-message-${item.id}`} style={[styles.messageRow, item.role === 'user' && styles.messageRowUser]}>
      <View style={[styles.avatar, item.role === 'assistant' ? styles.avatarAi : styles.avatarUser]}>
        <Ionicons
          name={item.role === 'assistant' ? 'sparkles' : 'person'}
          size={14}
          color={item.role === 'assistant' ? '#00D4AA' : '#666'}
        />
      </View>
      <View style={[
        styles.messageBubble,
        item.role === 'user' ? styles.userBubble : styles.aiBubble
      ]}>
        <Text style={[
          styles.messageText,
          item.role === 'user' && styles.userMessageText
        ]}>
          {item.content}
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View id="chat-header" style={styles.header}>
        <TouchableOpacity id="chat-back-btn" style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <TouchableOpacity
          id="chat-project-selector"
          style={styles.headerCenter}
          onPress={() => setShowProjectPicker(!showProjectPicker)}
        >
          <Text style={styles.headerTitle}>Script Co-Pilot</Text>
          <View style={styles.projectSelector}>
            <Text style={styles.projectName} numberOfLines={1}>
              {selectedProject ? selectedProject.name : 'Select a project'}
            </Text>
            <Ionicons name="chevron-down" size={12} color="#00D4AA" />
          </View>
        </TouchableOpacity>
        <TouchableOpacity id="chat-sparkle-btn" style={styles.sparkleBtn}>
          <Ionicons name="sparkles" size={20} color="#00D4AA" />
        </TouchableOpacity>
      </View>

      {/* Project Picker Dropdown */}
      {showProjectPicker && (
        <View id="chat-project-picker" style={styles.projectPicker}>
          {(!projects || projects.length === 0) ? (
            <Text style={styles.pickerEmpty}>No projects yet. Create one first!</Text>
          ) : (
            projects.map(project => (
              <TouchableOpacity
                key={project.id}
                id={`chat-project-option-${project.id}`}
                style={[
                  styles.pickerItem,
                  project.id === selectedProjectId && styles.pickerItemActive,
                ]}
                onPress={() => {
                  setSelectedProject(project.id);
                  setShowProjectPicker(false);
                }}
              >
                <Text style={[
                  styles.pickerItemText,
                  project.id === selectedProjectId && styles.pickerItemTextActive,
                ]}>
                  {project.name}
                </Text>
                {project.id === selectedProjectId && (
                  <Ionicons name="checkmark" size={16} color="#00D4AA" />
                )}
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* No project selected state */}
        {!selectedProjectId && (
          <View id="chat-no-project" style={styles.noProjectContainer}>
            <Ionicons name="chatbubbles-outline" size={48} color="#AEAEB2" />
            <Text style={styles.noProjectTitle}>Select a Project</Text>
            <Text style={styles.noProjectText}>
              Tap the project name above to choose a project for your script conversation.
            </Text>
          </View>
        )}

        {/* Messages */}
        {selectedProjectId && (
          <>
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={item => item.id}
              renderItem={renderMessage}
              contentContainerStyle={styles.messagesList}
              ListFooterComponent={
                isStreaming && messages[messages.length - 1]?.content === '' ? (
                  <View style={styles.messageRow}>
                    <View style={[styles.avatar, styles.avatarAi]}>
                      <Ionicons name="sparkles" size={14} color="#00D4AA" />
                    </View>
                    <View style={[styles.messageBubble, styles.aiBubble, styles.typingBubble]}>
                      <View style={styles.typingDots}>
                        <View style={styles.dot} />
                        <View style={styles.dot} />
                        <View style={styles.dot} />
                      </View>
                    </View>
                  </View>
                ) : null
              }
            />

            {/* Input Area */}
            <View id="chat-input-area" style={styles.inputArea}>
              {/* Quick Chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
              >
                {quickChips.map(chip => (
                  <TouchableOpacity
                    key={chip}
                    id={`chat-chip-${chip.replace(/\s/g, '-').toLowerCase()}`}
                    style={styles.chip}
                    onPress={() => handleSend(chip)}
                    disabled={isStreaming}
                  >
                    <Text style={styles.chipText}>{chip}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Input */}
              <View id="chat-input-row" style={styles.inputRow}>
                <TextInput
                  id="chat-text-input"
                  style={styles.input}
                  placeholder="Ask for script ideas..."
                  placeholderTextColor="#AEAEB2"
                  value={input}
                  onChangeText={setInput}
                  onSubmitEditing={() => handleSend()}
                  returnKeyType="send"
                  editable={!isStreaming}
                />
                <TouchableOpacity
                  id="chat-send-btn"
                  style={[styles.sendBtn, (!input.trim() || isStreaming) && styles.sendBtnDisabled]}
                  onPress={() => handleSend()}
                  disabled={!input.trim() || isStreaming}
                >
                  {isStreaming ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="send" size={18} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 0.5,
    borderBottomColor: '#E5E5EA',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  projectSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  projectName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#00D4AA',
    maxWidth: 160,
  },
  sparkleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectPicker: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 200,
  },
  pickerEmpty: {
    fontSize: 14,
    color: '#AEAEB2',
    textAlign: 'center',
    paddingVertical: 16,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  pickerItemActive: {
    backgroundColor: 'rgba(0, 212, 170, 0.08)',
  },
  pickerItemText: {
    fontSize: 15,
    color: '#1C1C1E',
  },
  pickerItemTextActive: {
    color: '#00D4AA',
    fontWeight: '600',
  },
  chatContainer: {
    flex: 1,
  },
  noProjectContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 12,
  },
  noProjectTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  noProjectText: {
    fontSize: 14,
    color: '#AEAEB2',
    textAlign: 'center',
    lineHeight: 20,
  },
  messagesList: {
    padding: 16,
    paddingBottom: 120,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 10,
  },
  messageRowUser: {
    flexDirection: 'row-reverse',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarAi: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  avatarUser: {
    backgroundColor: '#E5E5EA',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 14,
    borderRadius: 20,
  },
  aiBubble: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F0F0F0',
    borderTopLeftRadius: 4,
  },
  userBubble: {
    backgroundColor: '#00D4AA',
    borderTopRightRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1C1C1E',
  },
  userMessageText: {
    color: '#FFFFFF',
  },
  typingBubble: {
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#AEAEB2',
  },
  inputArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 24,
    backgroundColor: '#F5F5F5',
  },
  chips: {
    gap: 8,
    paddingBottom: 12,
  },
  chip: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingLeft: 20,
    paddingRight: 6,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#1C1C1E',
    paddingVertical: 8,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#00D4AA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
});
