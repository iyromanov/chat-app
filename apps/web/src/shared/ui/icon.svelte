<script lang="ts">
  let {
    name,
    size = 20,
  }: {
    name: 'search' | 'back' | 'close' | 'send' | 'menu' | 'chat' | 'logout';
    size?: number;
  } = $props();
  const paths = {
    search: 'm21 21-4.35-4.35 M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    back: 'm15 18-6-6 6-6 M9 12h12',
    close: 'm6 6 12 12 M6 18 18 6',
    send: 'm22 2-7 20-4-9-9-4 20-7Z M22 2 11 13',
    menu: 'M12 5h.01 M12 12h.01 M12 19h.01',
    chat: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z',
    logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  };
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={name === 'menu' ? 3 : 1.75}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"><path d={paths[name]} /></svg
>
