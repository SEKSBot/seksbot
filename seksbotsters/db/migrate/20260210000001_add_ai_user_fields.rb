class AddAiUserFields < ActiveRecord::Migration[7.0]
  def change
    # User flags for AI protection
    add_column :users, :is_ai_user, :boolean, default: true, null: false
    add_column :users, :verified_human, :boolean, default: false, null: false
    
    # Injection flags on stories
    add_column :stories, :injection_flag_count, :integer, default: 0, null: false
    add_column :stories, :injection_confirmed, :boolean, default: false, null: false
    add_column :stories, :injection_cleared_by_id, :integer, null: true
    add_column :stories, :injection_cleared_at, :datetime, null: true
    
    # Injection flags on comments
    add_column :comments, :injection_flag_count, :integer, default: 0, null: false
    add_column :comments, :injection_confirmed, :boolean, default: false, null: false
    add_column :comments, :injection_cleared_by_id, :integer, null: true
    add_column :comments, :injection_cleared_at, :datetime, null: true
    
    # Index for moderation queries
    add_index :stories, :injection_flag_count, where: "injection_flag_count > 0"
    add_index :comments, :injection_flag_count, where: "injection_flag_count > 0"
    add_index :users, :verified_human, where: "verified_human = true"
  end
end
