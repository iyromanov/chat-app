<script lang="ts">
  import { Avatar } from 'flowbite-svelte';
  let { username }: { username: string } = $props();
  let initials = $derived(Array.from(username).slice(0, 2).join(''));
</script>

<Avatar
  cornerStyle="circular"
  role="img"
  aria-label={`${username}'s avatar`}
  class="h-11 w-11 shrink-0 bg-blue-100 text-sm font-semibold text-blue-700"
  >{initials}</Avatar
>
