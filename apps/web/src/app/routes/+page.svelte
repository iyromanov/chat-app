<script lang="ts">
  import { onMount } from 'svelte';
  import type { CurrentUser } from '@chat/contracts';
  import { ChatPage } from '@pages/chat';
  import { LoginPage } from '@pages/login';
  import { RegisterPage } from '@pages/register';
  import {
    Alert,
    Button,
    Card,
    Heading,
    Helper,
    P,
    Spinner,
  } from 'flowbite-svelte';
  import { createAuth } from '../auth';
  const auth = createAuth();
  let registering = $state(false);
  let logoutError = $state('');
  function signedIn(user: CurrentUser, expiresAt: number) {
    registering = false;
    auth.registered(user, expiresAt);
  }
  async function logout() {
    logoutError = '';
    try {
      await auth.logout();
    } catch {
      logoutError = 'Unable to sign out. Please try again';
    }
  }
  onMount(() => {
    void auth.restore();
    return auth.dispose;
  });
</script>

<svelte:window onstorage={auth.storageChanged} />
<svelte:document onvisibilitychange={auth.visibilityChanged} />

<svelte:head
  ><title>Chat</title><meta
    name="description"
    content="Private chat"
  /></svelte:head
>
{#if auth.state.status === 'loading'}
  <main class="grid min-h-dvh place-items-center p-6">
    <div role="status" aria-live="polite" class="flex items-center gap-3">
      <Spinner aria-hidden="true" />
      <P>Checking your session…</P>
    </div>
  </main>
{:else if auth.state.status === 'error'}
  <main class="grid min-h-dvh place-items-center p-6">
    <div class="flex w-full max-w-md flex-col gap-4">
      <Alert color="red" role="alert">{auth.state.error}</Alert>
      <Button onclick={auth.restore}>Try again</Button>
    </div>
  </main>
{:else if auth.state.status === 'authenticated'}
  <main class="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-8">
    <Card size="xl" class="gap-4 p-6">
      <Helper>Private area</Helper>
      <Heading tag="h1" class="text-3xl"
        >Welcome, {auth.state.user.username}!</Heading
      >

      {#if logoutError}<Alert color="red" role="alert">{logoutError}</Alert
        >{/if}
      <Button onclick={logout}>Sign out</Button>
    </Card>
    {#key auth.state.user.id}<ChatPage
        api={auth.api}
        conversations={auth.conversations}
      />{/key}
  </main>
{:else if registering}
  <RegisterPage
    api={auth.api}
    onRegistered={signedIn}
    onSignIn={() => (registering = false)}
  />
{:else}
  <LoginPage
    api={auth.api}
    onLoggedIn={signedIn}
    onRegister={() => (registering = true)}
  />
{/if}
