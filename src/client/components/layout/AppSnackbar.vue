<template>
  <v-snackbar
    v-model="snackbarStore.visible"
    :color="snackbarStore.color"
    :timeout="snackbarStore.timeout"
    location="bottom right"
  >
    <div class="d-flex align-center">
      <v-icon class="mr-2">{{ snackbarStore.icon }}</v-icon>
      {{ snackbarStore.message }}
    </div>

    <template #actions>
      <v-btn variant="text" @click="snackbarStore.hide()">{{ t('common.buttons.close') }}</v-btn>
    </template>
  </v-snackbar>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useSnackbarStore } from '../../stores/snackbar';

const { t } = useI18n();
const snackbarStore = useSnackbarStore();
</script>
