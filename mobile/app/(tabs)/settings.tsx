import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080';

function SettingsRow({
  icon, color, label, value, onPress
}: { icon: any; color: string; label: string; value?: string; onPress?: () => void }) {
  return (
    <TouchableOpacity
      id={`settings-row-${label.replace(/\s+/g, '-').toLowerCase()}`}
      style={styles.row}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[styles.rowIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        {value && <Text style={styles.rowValue}>{value}</Text>}
        {onPress && <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />}
      </View>
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const handleCheckHealth = async () => {
    try {
      const response = await fetch(`${API_URL}/health`);
      const data = await response.json();
      Alert.alert('API Status', `Status: ${data.status}\nService: ${data.service}\nURL: ${API_URL}`);
    } catch (err: any) {
      Alert.alert('API Unreachable', `Could not connect to ${API_URL}\n\nError: ${err.message}`);
    }
  };

  return (
    <SafeAreaView id="settings-container" style={styles.container} edges={['top']}>
      <View id="settings-header" style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Profile */}
        <View id="settings-profile" style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>C</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>Creator</Text>
            <Text style={styles.profileEmail}>MVP User</Text>
          </View>
        </View>

        {/* API Connection */}
        <Text style={styles.groupLabel}>Connection</Text>
        <View id="settings-connection-group" style={styles.group}>
          <SettingsRow
            icon="server"
            color={Colors.primary}
            label="API Server"
            value={API_URL.replace('http://', '').replace('https://', '')}
          />
          <SettingsRow
            icon="pulse"
            color={Colors.success}
            label="Check API Health"
            onPress={handleCheckHealth}
          />
        </View>

        {/* Processing */}
        <Text style={styles.groupLabel}>Processing Limits</Text>
        <View id="settings-processing-group" style={styles.group}>
          <SettingsRow icon="time" color={Colors.primary} label="Max Video Duration" value="30 min" />
          <SettingsRow icon="cloud-upload" color={Colors.primary} label="Max File Size" value="2 GB" />
          <SettingsRow icon="film" color={Colors.primary} label="Clips Per Video" value="3-15" />
        </View>

        {/* About */}
        <Text style={styles.groupLabel}>About</Text>
        <View id="settings-about-group" style={styles.group}>
          <SettingsRow icon="information-circle" color="#8E8E93" label="App Version" value="1.0.0-mvp" />
          <SettingsRow icon="logo-github" color="#8E8E93" label="Source Code" onPress={() => {}} />
          <SettingsRow icon="chatbubble-ellipses" color="#8E8E93" label="Give Feedback" onPress={() => {}} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.bg },
  header:      { padding: 20, backgroundColor: Colors.white, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  title:       { fontSize: 22, fontWeight: '700', color: Colors.text },
  scroll:      { padding: 16, paddingBottom: 100 },
  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: 14, padding: 16, gap: 14, marginBottom: 24, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  avatar:      { width: 50, height: 50, borderRadius: 25, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText:  { fontSize: 22, fontWeight: '700', color: Colors.white },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 17, fontWeight: '700', color: Colors.text },
  profileEmail:{ fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  groupLabel:  { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
  group:       { backgroundColor: Colors.white, borderRadius: 14, marginBottom: 20, overflow: 'hidden' },
  row:         { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  rowIcon:     { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowLabel:    { flex: 1, fontSize: 15, color: Colors.text },
  rowRight:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowValue:    { fontSize: 15, color: Colors.textSecondary },
});
