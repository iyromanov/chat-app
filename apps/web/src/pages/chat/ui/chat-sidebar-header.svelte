<script lang="ts">
  import { Alert, Button } from 'flowbite-svelte';
  import { Icon } from '@shared/ui';

  let {
    mobileSearch,
    connectionState,
    onSearch,
    onLogout,
  }: {
    mobileSearch: boolean;
    connectionState: string;
    onSearch: () => void;
    onLogout: () => Promise<void>;
  } = $props();

  let menuOpen = $state(false);
  let signingOut = $state(false);
  let logoutError = $state('');
  let menuElement: HTMLDivElement;

  function search() {
    menuOpen = false;
    onSearch();
  }

  function keyboard(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !menuOpen) return;
    event.preventDefault();
    menuOpen = false;
  }

  function outside(event: MouseEvent) {
    if (menuOpen && !menuElement?.contains(event.target as Node))
      menuOpen = false;
  }

  async function logout() {
    if (signingOut) return;
    signingOut = true;
    logoutError = '';
    try {
      await onLogout();
    } catch {
      logoutError = 'Unable to sign out. Please try again';
    } finally {
      signingOut = false;
      menuOpen = false;
    }
  }
</script>

<svelte:window onkeydowncapture={keyboard} onclick={outside} />

<header
  class={[
    'h-14 shrink-0 items-center justify-between px-4',
    mobileSearch ? 'hidden md:flex' : 'flex',
  ]}
>
  <h1 class="text-xl font-semibold tracking-tight">
    <span class="hidden md:inline"
      >Chat<span class="text-blue-600">.</span></span
    ><span class="md:hidden">Chats</span>
  </h1>
  <div class="flex items-center gap-1">
    <Button
      color="alternative"
      aria-label="Search users"
      onclick={search}
      class="h-9 w-9 rounded-full border-0 p-0 shadow-none md:hidden"
      ><Icon name="search" /></Button
    >
    <Button
      color="alternative"
      size="xs"
      onclick={logout}
      disabled={signingOut}
      class="hidden gap-2 rounded-lg border-0 text-gray-500 shadow-none md:flex"
      ><Icon name="logout" size={16} />Sign out</Button
    >
    <div bind:this={menuElement} class="relative md:hidden">
      <Button
        color="alternative"
        aria-label="Open menu"
        aria-expanded={menuOpen}
        aria-controls="account-menu"
        onclick={() => (menuOpen = !menuOpen)}
        class="h-9 w-9 rounded-full border-0 p-0 shadow-none"
        ><Icon name="menu" /></Button
      >
      {#if menuOpen}<div
          id="account-menu"
          class="absolute right-0 top-11 z-20 w-36 rounded-xl border border-gray-100 bg-white p-1 shadow-lg"
        >
          <Button
            color="alternative"
            onclick={logout}
            disabled={signingOut}
            class="w-full justify-start gap-2 border-0 shadow-none"
            ><Icon name="logout" size={16} />Sign out</Button
          >
        </div>{/if}
    </div>
  </div>
</header>
<p
  role="status"
  aria-live="polite"
  class="shrink-0 px-4 pb-2 text-xs text-gray-500"
>
  {connectionState}
</p>
{#if logoutError}<div class="shrink-0 px-3 pb-2">
    <Alert color="red" role="alert">{logoutError}</Alert>
  </div>{/if}
