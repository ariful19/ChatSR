using Microsoft.EntityFrameworkCore;
namespace ChatSR.Models
{
    public class ChatDbContext : DbContext
    {
        public ChatDbContext()
        { }
        public ChatDbContext(DbContextOptions<ChatDbContext> options) : base(options) { }
        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        {
            if (!optionsBuilder.IsConfigured)
            {
                optionsBuilder.UseSqlite("Data Source=chat.db;");
                optionsBuilder.LogTo(Console.WriteLine);
            }
        }
        public DbSet<User> Users { get; set; }
        public DbSet<Chat> Chats { get; set; }
    }

    public class User
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public string Email { get; set; } = "";
        public string? ConnectinId { get; set; } = null;
    }
    public class Chat
    {
        public int Id { get; set; }
        public int FromUser { get; set; }
        public int ToUser { get; set; }
        public string Message { get; set; } = "";
        public string? FileName { get; set; }
        public DateTime Time { get; set; }

    }
}
