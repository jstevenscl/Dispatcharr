import React from 'react';
import { Group, Loader, SimpleGrid, Stack, Text } from '@mantine/core';
import MediaCard from './MediaCard';

const groupItemsByLetter = (items) => {
  const map = new Map();
  items.forEach((item) => {
    const name = item.sort_title || item.title || '';
    const firstChar = name.charAt(0).toUpperCase();
    const key = /[A-Z]/.test(firstChar) ? firstChar : '#';
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(item);
  });
  return map;
};

const MediaGrid = ({
  items,
  loading,
  onSelect,
  onContextMenu,
  groupByLetter = false,
  letterRefs,
  columns = { base: 1, sm: 2, md: 4, lg: 5 },
  cardSize = 'md',
}) => {
  if (loading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    );
  }

  if (!items || items.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        No media found.
      </Text>
    );
  }

  if (groupByLetter) {
    const grouped = groupItemsByLetter(items);
    const sortedKeys = Array.from(grouped.keys()).sort();
    return (
      <Stack spacing="xl">
        {sortedKeys.map((letter) => {
          const refCallback = (el) => {
            if (letterRefs && el) {
              letterRefs.current[letter] = el;
            }
          };
          return (
            <Stack key={letter} spacing="md" ref={refCallback}>
              <Text fw={700} size="lg">
                {letter}
              </Text>
              <SimpleGrid cols={columns} spacing="lg">
                {grouped.get(letter).map((item) => (
                  <MediaCard
                    key={item.id}
                    item={item}
                    onClick={onSelect}
                    onContextMenu={onContextMenu}
                    size={cardSize}
                  />
                ))}
              </SimpleGrid>
            </Stack>
          );
        })}
      </Stack>
    );
  }

  return (
    <SimpleGrid cols={columns} spacing="lg">
      {items.map((item) => (
        <MediaCard
          key={item.id}
          item={item}
          onClick={onSelect}
          onContextMenu={onContextMenu}
          size={cardSize}
        />
      ))}
    </SimpleGrid>
  );
};

export default MediaGrid;
