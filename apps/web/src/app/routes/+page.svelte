<script lang="ts">
  import { onMount } from 'svelte';
  import type { Registration } from '@chat/contracts/auth';
  import { ChatPage } from '@pages/chat';
  import { LoginPage } from '@pages/login';
  import { RegisterPage } from '@pages/register';
  import { Alert, Button, P, Spinner } from 'flowbite-svelte';
  import { createAppRuntime } from '../runtime';
  const runtime = createAppRuntime();
  const auth = runtime.auth;
  let registering = $state(false);
  async function register(input: Registration) {
    await runtime.session.register(input);
    registering = false;
  }

  onMount(() => {
    runtime.start();
    return runtime.dispose;
  });
</script>

<svelte:document onvisibilitychange={runtime.visibilityChanged} />

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
      <Button onclick={runtime.session.restore}>Try again</Button>
    </div>
  </main>
{:else if auth.state.status === 'authenticated' && runtime.context}
  {@const context = runtime.context}
  <main>
    {#key context}<ChatPage
        connectionState={context.connectionState}
        conversations={context.chat.conversations}
        messages={context.chat.messages}
        userId={auth.state.user.id}
        onSend={context.chat.sendMessage}
        onOpen={context.chat.openConversation}
        onLoadMessages={context.chat.loadMessages}
        onLoadConversations={context.chat.loadConversations}
        onSearch={context.chat.searchUsers}
        onStart={context.chat.startConversation}
        onLogout={runtime.session.logout}
      />{/key}
  </main>
{:else if registering}
  <RegisterPage onRegister={register} onSignIn={() => (registering = false)} />
{:else}
  <LoginPage
    onLogin={runtime.session.login}
    onCreateAccount={() => (registering = true)}
  />
{/if}
