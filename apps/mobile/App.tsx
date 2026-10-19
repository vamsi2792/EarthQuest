import { useMemo, useState } from "react";
import { Button, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";
import { createApiClient } from "@earthquest/api-client";
import { useNpcChat } from "@earthquest/game-state";

// Android emulators reach the host machine at 10.0.2.2; override for a real device.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:4000";

export default function App() {
  const api = useMemo(() => createApiClient({ baseUrl: API_URL }), []);
  const { messages, send } = useNpcChat(api, "elder-maren", "player-1");
  const [draft, setDraft] = useState("");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#10151c" }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
        {messages.map((m) => (
          <Text
            key={m.id}
            style={{
              color: "#e8edf2",
              padding: 8,
              borderRadius: 8,
              backgroundColor: m.role === "player" ? "#23405e" : "#1d2733",
              alignSelf: m.role === "player" ? "flex-end" : "flex-start",
            }}
          >
            {m.text}
            {m.pending ? "▍" : ""}
          </Text>
        ))}
      </ScrollView>
      <View style={{ flexDirection: "row", padding: 8, gap: 8 }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Speak to the elder..."
          placeholderTextColor="#888"
          style={{ flex: 1, color: "#e8edf2", borderWidth: 1, borderColor: "#345", padding: 8 }}
        />
        <Button
          title="Send"
          onPress={() => {
            if (!draft.trim()) return;
            void send(draft.trim());
            setDraft("");
          }}
        />
      </View>
    </SafeAreaView>
  );
}
