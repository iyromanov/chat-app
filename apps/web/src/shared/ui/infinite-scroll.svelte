<script lang="ts">
  import { Button } from 'flowbite-svelte';
  let { onLoad }: { onLoad: () => void } = $props();

  function observe(element: Element) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoad();
      },
      { rootMargin: '150px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }
</script>

<div {@attach observe} class="flex justify-center p-2">
  <Button color="alternative" size="sm" onclick={onLoad}>Load more</Button>
</div>
