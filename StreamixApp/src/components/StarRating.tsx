import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

export default function StarRating({ value, onChange, size = 28 }: {
  value: number; onChange?: (v: number) => void; size?: number;
}) {
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          onPress={() => onChange?.(n)}
          disabled={!onChange}
          hitSlop={10}
          style={styles.starHit}
        >
          <Text style={{ fontSize: size, color: n <= value ? colors.star : '#555' }}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  starHit: { paddingHorizontal: 6, paddingVertical: 4 },
});
