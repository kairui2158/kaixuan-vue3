<template>
  <div class="app-container">
    <!-- Vue 3 migration placeholder -->
    <div class="migration-placeholder">
      <h1>Novel Workshop - Vue 3 Migration</h1>
      <p>Migration in progress. Old version still runs via main.js.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
// Root component - will be progressively filled during migration
</script>

<style scoped>
.app-container {
  width: 100vw;
  height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-family);
  overflow: hidden;
}
.migration-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
}
.migration-placeholder h1 {
  font-size: 20px;
  color: var(--accent);
}
.migration-placeholder p {
  color: var(--text-secondary);
  font-size: 14px;
}
</style>
