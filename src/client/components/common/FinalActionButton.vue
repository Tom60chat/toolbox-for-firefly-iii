<template>
  <v-btn
    v-if="!props.hasRun"
    color="primary"
    :prepend-icon="props.icon"
    :loading="props.loading"
    @click="$emit('click')"
  >
    {{ resolvedText }}
  </v-btn>
  <v-btn
    v-else
    color="primary"
    variant="outlined"
    :prepend-icon="props.rerunIcon"
    :loading="props.loading"
    @click="$emit('click')"
  >
    {{ resolvedRerunText }}
  </v-btn>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    /** Whether the action has been run at least once */
    hasRun?: boolean;
    /** Primary action text */
    text?: string;
    /** Re-run action text */
    rerunText?: string;
    /** Icon for primary action */
    icon?: string;
    /** Icon for re-run action */
    rerunIcon?: string;
    /** Whether action is loading */
    loading?: boolean;
  }>(),
  {
    hasRun: false,
    text: undefined,
    rerunText: undefined,
    icon: 'mdi-play',
    rerunIcon: 'mdi-refresh',
    loading: false,
  }
);

const resolvedText = computed(() => props.text ?? t('common.buttons.run'));
const resolvedRerunText = computed(() => props.rerunText ?? t('common.buttons.rerun'));

defineEmits<{
  click: [];
}>();
</script>
