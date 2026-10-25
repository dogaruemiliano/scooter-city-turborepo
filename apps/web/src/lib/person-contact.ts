export function whatsappHrefForPhone(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}
