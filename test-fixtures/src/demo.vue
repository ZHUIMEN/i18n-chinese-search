<template>
  <div>{{ $t('user.name') }}</div>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const title = t('user.profile.title');
</script>
