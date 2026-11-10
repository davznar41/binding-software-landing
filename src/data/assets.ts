export interface ImageAsset {
  src: string;
  width: number;
  height: number;
  alt: string;
}

export const assets = {
  brand: {
    src: '/assets/binding-logo.webp',
    width: 500,
    height: 125,
    alt: 'Binding Software',
  },
  identity: {
    src: '/assets/product/binding-identity.webp',
    width: 742,
    height: 336,
    alt: 'Binding Identity',
  },
  mascot: {
    src: '/assets/branding/mascota-160.webp',
    width: 160,
    height: 160,
    alt: '',
  },
  sihot: {
    src: '/assets/icons/sihot.svg',
    width: 152,
    height: 20,
    alt: 'SIHOT',
  },
  oracle: {
    src: '/assets/icons/oracle.svg',
    width: 70,
    height: 22,
    alt: 'Oracle',
  },
} satisfies Record<string, ImageAsset>;

export const heroImages = {
  desktop: '/assets/images/hotel-1440.webp',
  desktopSrcset:
    '/assets/images/hotel-1440.webp 1440w, /assets/images/hotel-1920.webp 1920w',
  mobileSrcset:
    '/assets/images/hotel-mobile-480.webp 480w, /assets/images/hotel-mobile-768.webp 768w',
};
export const officialContact = 'https://bindingsoftware.com/contacto/';
