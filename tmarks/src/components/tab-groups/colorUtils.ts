/**
 * 颜色工具函数和常量
 */

export const COLORS = [
  { name: '无', value: null, bg: 'bg-gray-100', border: 'border-gray-300' },
  { name: '红色', value: '红色', bg: 'bg-red-100', border: 'border-red-300' },
  { name: '橙色', value: '橙色', bg: 'bg-orange-100', border: 'border-orange-300' },
  { name: '黄色', value: '黄色', bg: 'bg-yellow-100', border: 'border-yellow-300' },
  { name: '绿色', value: '绿色', bg: 'bg-green-100', border: 'border-green-300' },
  { name: '蓝色', value: '蓝色', bg: 'bg-blue-100', border: 'border-blue-300' },
  { name: '紫色', value: '紫色', bg: 'bg-purple-100', border: 'border-purple-300' },
  { name: '粉色', value: '粉色', bg: 'bg-pink-100', border: 'border-pink-300' },
] as const

export function getColorClasses(color: string | null): string {
  switch (color) {
    case '红色':
      return 'bg-red-50 border-red-300 hover:bg-red-100'
    case '橙色':
      return 'bg-orange-50 border-orange-300 hover:bg-orange-100'
    case '黄色':
      return 'bg-yellow-50 border-yellow-300 hover:bg-yellow-100'
    case '绿色':
      return 'bg-green-50 border-green-300 hover:bg-green-100'
    case '蓝色':
      return 'bg-blue-50 border-blue-300 hover:bg-blue-100'
    case '紫色':
      return 'bg-purple-50 border-purple-300 hover:bg-purple-100'
    case '粉色':
      return 'bg-pink-50 border-pink-300 hover:bg-pink-100'
    default:
      return 'bg-card border-border hover:bg-accent'
  }
}
