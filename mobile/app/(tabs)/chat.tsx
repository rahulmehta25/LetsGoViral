import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
}

const quickChips = ['Hook ideas', 'Add CTA', 'Viral frameworks', 'Tone check'];

const aiResponses: Record<string, string> = {
  'hook': "Here are 3 viral hook templates:\n\n1. 'Stop doing [X] if you want [Y]...'\n2. 'I tried [X] for 30 days and...'\n3. 'The secret tool nobody is talking about...'",
  'cta': "Try these high-converting CTAs:\n\n• 'Save this for later so you don't forget'\n• 'Comment [WORD] and I'll send you the link'\n• 'Share this with a friend who needs to hear it'",
  'framework': "The classic viral framework:\n\n1. Hook (0-3s): Pattern interrupt\n2. Re-hook (3-10s): State the problem\n3. Value (10-40s): The solution/story\n4. CTA (40-60s): Tell them what to do next",
  'tone': "Your tone sounds authoritative but friendly. To make it more viral, try adding more urgency in the first sentence and using simpler language.",
  'default': "That's an interesting angle! I'd suggest focusing on the emotional transformation. How will the viewer feel after watching this?",
};

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'ai', text: "Hi! I'm your Script Co-Pilot. What kind of video are you planning today?" }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const getAIResponse = (userInput: string): string => {
    const lowerInput = userInput.toLowerCase();
    if (lowerInput.includes('hook')) return aiResponses.hook;
    if (lowerInput.includes('cta')) return aiResponses.cta;
    if (lowerInput.includes('framework')) return aiResponses.framework;
    if (lowerInput.includes('tone')) return aiResponses.tone;
    return aiResponses.default;
  };

  const handleSend = (text: string = input) => {
    if (!text.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: text.trim(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        text: getAIResponse(text),
      };
      setMessages(prev => [...prev, aiMessage]);
      setIsTyping(false);
    }, 1500);
  };

  useEffect(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages, isTyping]);

  const renderMessage = ({ item }: { item: Message }) => (
    <View style={[styles.messageRow, item.role === 'user' && styles.messageRowUser]}>
      <View style={[styles.avatar, item.role === 'ai' ? styles.avatarAi : styles.avatarUser]}>
        <Ionicons
          name={item.role === 'ai' ? 'sparkles' : 'person'}
          size={14}
          color={item.role === 'ai' ? '#00D4AA' : '#666'}
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
          {item.text}
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Script Co-Pilot</Text>
          <View style={styles.onlineStatus}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>Online</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.sparkleBtn}>
          <Ionicons name="sparkles" size={20} color="#00D4AA" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          ListFooterComponent={
            isTyping ? (
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
        <View style={styles.inputArea}>
          {/* Quick Chips */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {quickChips.map(chip => (
              <TouchableOpacity
                key={chip}
                style={styles.chip}
                onPress={() => handleSend(chip)}
              >
                <Text style={styles.chipText}>{chip}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Input */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Ask for script ideas..."
              placeholderTextColor="#AEAEB2"
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => handleSend()}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
              onPress={() => handleSend()}
              disabled={!input.trim()}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
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
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  onlineStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00D4AA',
  },
  onlineText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#00D4AA',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sparkleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatContainer: {
    flex: 1,
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
